import { Component, OnDestroy, OnInit } from '@angular/core';
import { MqttService, IMqttMessage } from 'ngx-mqtt';
import { HttpClient } from '@angular/common/http';
import axios from 'axios';
import { Subscription } from 'rxjs';

import { ConfigSensore, Habitacion } from '../domain/Habitacion';

@Component({
  selector: 'app-emulador',
  templateUrl: './emulador.component.html',
  styleUrls: ['./emulador.component.css']
})
export class EmuladorComponent implements OnInit, OnDestroy {
  intervalId: any;
  hostapi: string = "http://192.168.137.1:3000";

  temperaturaActual: number = 36;
  presionSistolica: number = 120;
  presionDiastolica: number = 80;
  oxigenacion: number = 95;
  ritmoCardiacoActual: number = 65;

  sirenaActiva: boolean = false;
  bocinaActiva: boolean = false;
  hayvaloresAlerta: boolean = false;
  CatalogoSensores: any[] = [];
  confiAlerta: ConfigSensore[] | undefined = [];
  habitacionesOcupadas: Habitacion[] = [];
  configHabitaciones: Map<number, ConfigSensore[]> | undefined = new Map();

  habitacionSeleccionada: any = null;

  private sirenaSub: Subscription | null = null;
  private bocinaSub: Subscription | null = null;
  private updateSub: Subscription | null = null;

  constructor(private httpClient: HttpClient, private mqttService: MqttService) { }

  ngOnInit(): void {
    this.obtenerCatalogoSensores();
    this.obtenerHabitacionesOcupadas();
    this.mqttService.connect();
  }

  ngOnDestroy(): void {
    clearInterval(this.intervalId);
    this.mqttService.disconnect();
    this.limpiarSubscripciones();
  }

  obtenerCatalogoSensores() {
    this.httpClient.get<any[]>(this.hostapi + '/api/sensores/catalogo')
      .subscribe((sensores: any[]) => {
        this.CatalogoSensores = sensores;
      });
  }

  async obtenerConfig(id_hab: number) {
    const data = await axios.get(this.hostapi + '/api/config-sensores/' + id_hab);
    return data.data;
  }

  obtenerHabitacionesOcupadas() {
    this.httpClient.get<Habitacion[]>(this.hostapi + '/api/habitaciones/ocupados')
      .subscribe((habitaciones: Habitacion[]) => {
        this.habitacionesOcupadas = habitaciones;
        habitaciones.forEach((hab) => {
          this.configHabitaciones!.set(hab.id_habitacion, hab.config_sensores);
        });
      });
  }

  iniciar() {
    this.hayvaloresAlerta = false
    this.detener();
    this.subscripciones();
    this.intervalId = setInterval(() => {
      this.generarDatos();
    }, 1000);
  }

  signosAltos() {
    this.hayvaloresAlerta = true
    this.detener();
    this.subscripciones();
    this.activarAlertas();
    this.intervalId = setInterval(() => {
      this.generarDatos(true);
    }, 1000);
  }

  signosBajos() {
    this.hayvaloresAlerta = true

    this.detener();
    this.subscripciones();
    this.activarAlertas();
    this.intervalId = setInterval(() => {
      this.generarDatos(false, true);
    }, 1000);
  }

  estable() {
    this.hayvaloresAlerta = false

    this.detener();
    this.subscripciones();
    this.temperaturaActual = 36;
    this.presionSistolica = 120;
    this.presionDiastolica = 80;
    this.oxigenacion = 95;
    this.ritmoCardiacoActual = 60;
    this.intervalId = setInterval(() => {
      this.generarDatos();
    }, 1000);
  }

  detener() {
    this.hayvaloresAlerta = false

    this.desactivarAlertas();
    clearInterval(this.intervalId);
    this.limpiarSubscripciones();
  }

  async generarDatos(signosAltos = false, signosBajos = false): Promise<void> {
    const rango = (min: number, max: number) => Math.random() * (max - min) + min;

    if (signosAltos) {
      this.temperaturaActual += rango(0.05, 0.2);
      this.presionSistolica += rango(5, 10);
      this.presionDiastolica += rango(3, 7);
      this.oxigenacion += rango(0.5, 2);
      this.ritmoCardiacoActual += rango(2, 5);
    } else if (signosBajos) {
      this.temperaturaActual -= rango(0.05, 0.2);
      this.presionSistolica -= rango(5, 10);
      this.presionDiastolica -= rango(3, 7);
      this.oxigenacion -= rango(0.5, 2);
      this.ritmoCardiacoActual -= rango(2, 5);
    }

    this.temperaturaActual = Math.min(38, Math.max(35, this.temperaturaActual));
    this.presionSistolica = Math.min(180, Math.max(90, this.presionSistolica));
    this.presionDiastolica = Math.min(120, Math.max(60, this.presionDiastolica));
    this.oxigenacion = Math.min(100, Math.max(95, this.oxigenacion));
    this.ritmoCardiacoActual = Math.min(100, Math.max(60, this.ritmoCardiacoActual));

    const promesasPublicacion: Promise<void>[] = [];
    const promesasEmergencia: Promise<void>[] = [];

    this.CatalogoSensores.forEach(sensor => {
      let valor = 0;
      switch (sensor.nombre) {
        case 'Oxigenacion':
          valor = this.oxigenacion;
          break;
        case 'Frecuencia Cardiaca':
          valor = this.ritmoCardiacoActual;
          break;
        case 'Presion Arterial Sistolica':
          valor = this.presionSistolica;
          break;
        case 'Presion Arterial Diastolica':
          valor = this.presionDiastolica;
          break;
        case 'Temperatura Corporal':
          valor = this.temperaturaActual;
          break;
        default:
          break;
      }
      valor = parseFloat(valor.toFixed(2));
      promesasPublicacion.push(this.publicarMensaje(this.habitacionSeleccionada!.id_habitacion, sensor, valor));

      const configAlerta = this.confiAlerta?.find(conf => conf.topico_sensor === sensor.topico);
      if (configAlerta && (valor < configAlerta.min_valor || valor > configAlerta.max_valor)) {
        const publicarEmergenciaPromise = this.publicarEmergencia({
          id_habitacion: this.habitacionSeleccionada.id_habitacion,
          sensor: sensor.nombre,
          topico: sensor.topico,
          valor: valor
        });
        promesasEmergencia.push(publicarEmergenciaPromise);
      }
    });

    try {
      await Promise.all([...promesasPublicacion, ...promesasEmergencia]);
    } catch (error) {
      console.error('Error en la generación de datos:', error);
    }
  }

  publicarEmergencia(payloadObj: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const ruta = `SMMI/Habitacion${payloadObj.id_habitacion}/emergencia`;
      console.log(ruta, "<----");
      const payload = JSON.stringify(payloadObj);
      this.mqttService.publish(ruta, payload, { qos: 2 }).subscribe(() => {
        console.log(`ALERTA!!!!!!!!!!!!!`);
        resolve();
      }, (error) => {
        console.error(`Error al enviar mensaje de Alerta`, error);
        reject(error);
      });
    });
  }

  publicarMensaje(idHabitacion: number, sensor: any, valor: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ruta = `SMMI/Sensores/Habitacion${idHabitacion}${sensor.topico}`;
      console.log(ruta);
      const payloadObj: any = {
        id_sensor: sensor.id,
        valor: valor,
        id_habitacion: idHabitacion
      };
      const payload = JSON.stringify(payloadObj);
      this.mqttService.publish(ruta, payload, { qos: 0 }).subscribe(() => {
        console.log(`${sensor.topico} => habitación ${idHabitacion}--${valor}`);
        resolve();
      }, (error) => {
        console.error(`Error al enviar mensaje de ${sensor.topico} a la habitación ${idHabitacion}:`, error);
        reject(error);
      });
    });
  }

  activarAlertas() {
    this.sirenaActiva = true;
    this.bocinaActiva = true;
  }

  desactivarAlertas() {
    this.sirenaActiva = false;
    this.bocinaActiva = false;
  }

  subscripciones() {
    if (this.habitacionSeleccionada) {
      this.sirenaSub = this.subscribirSirena(this.habitacionSeleccionada.id_habitacion);
      this.bocinaSub = this.subscribirBocina(this.habitacionSeleccionada.id_habitacion);
      this.updateSub = this.subscibirUpdate(this.habitacionSeleccionada.id_habitacion);
      console.log('Subscripciones activas:', this.sirenaSub, this.bocinaSub, this.updateSub);
    }
  }


  subscribirSirena(id_habitacion: number): Subscription {
    return this.mqttService.observe(`SMMI/Habitacion${id_habitacion}/sirena`).subscribe((message: IMqttMessage) => {
      if (message.payload.toString() === '1') {
        this.activarSirena();
      } else {
        this.desactivarSirena();
        // Establece un intervalo de 5 minutos (300000 milisegundos)
        setInterval(this.checkVariable, 120000);
      }
    });
  }
  checkVariable = () => {
    // console.log('Hola ', this.hayvaloresAlerta)
    if (this.hayvaloresAlerta) {
      this.activarBocina();
      this.activarSirena()
    }
  };
  subscribirBocina(id_habitacion: number): Subscription {
    return this.mqttService.observe(`SMMI/Habitacion${id_habitacion}/bocina`).subscribe((message: IMqttMessage) => {
      if (message.payload.toString() === '1') {
        this.activarBocina();
      } else {
        this.desactivarBocina();


        // Establece un intervalo de 5 minutos (300000 milisegundos)
        setInterval(this.checkVariable, 300000);

      }
    });
  }

  subscibirUpdate(id_habitacion: number): Subscription {
    return this.mqttService.observe(`SMMI/Habitacion${id_habitacion}/notificacion_config`).subscribe(async (message: IMqttMessage) => {
      this.confiAlerta = await this.obtenerConfig(id_habitacion);
      console.log(this.confiAlerta);
      console.log('update config...');
    });
  }


  limpiarSubscripciones() {
    if (this.sirenaSub) {
      this.sirenaSub.unsubscribe();
      this.sirenaSub = null;
    }
    if (this.bocinaSub) {
      this.bocinaSub.unsubscribe();
      this.bocinaSub = null;
    }
    if (this.updateSub) {
      console.log('Desuscribiendo de notificacion_config');
      try {
        this.updateSub.unsubscribe();
      } catch (error) {
        console.error('Error al desuscribirse de notificacion_config:', error);
      }
      this.updateSub = null;
    }
  }


  activarSirena() {
    this.sirenaActiva = true;
  }

  desactivarSirena() {
    this.sirenaActiva = false;
  }

  activarBocina() {
    this.bocinaActiva = true;
  }

  desactivarBocina() {
    this.bocinaActiva = false;
  }

  async seleccionarHabitacion(event: Event) {
    const idHabitacion = (event.target as HTMLSelectElement).value;
    if (idHabitacion) {
      this.habitacionSeleccionada = this.habitacionesOcupadas.find(habitacion => habitacion.id_habitacion === Number(idHabitacion));
      if (this.habitacionSeleccionada) {
        this.confiAlerta = this.configHabitaciones!.get(this.habitacionSeleccionada.id_habitacion);
        this.subscibirUpdate(this.habitacionSeleccionada.id_habitacion);
        console.log(this.confiAlerta);
        this.subscripciones();
      }
    }
  }
}
