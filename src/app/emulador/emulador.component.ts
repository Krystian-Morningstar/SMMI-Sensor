import { Component, OnDestroy, OnInit } from '@angular/core';
import { MqttService, IMqttMessage } from 'ngx-mqtt';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-emulador',
  templateUrl: './emulador.component.html',
  styleUrls: ['./emulador.component.css']
})
export class EmuladorComponent implements OnInit, OnDestroy {
  intervalId: any;
  hostapi: string = "http://192.168.1.67:3000"
  temperaturaActual: number = 36;
  presionSistolica: number = 120;
  presionDiastolica: number = 80;
  oxigenacion: number = 95;
  ritmoCardiacoActual: number = 65;
  sirenaActiva: boolean = false;
  bocinaActiva: boolean = false;
  sensores: any[] = [];
  habitacionesOcupadas: any[] = [];
  habitacionSeleccionada: any;

  constructor(private httpClient: HttpClient, private mqttService: MqttService) { }

  ngOnInit(): void {
    this.obtenerCatalogoSensores();
    this.obtenerHabitacionesOcupadas();
    this.subscribirSirena();
    this.subscribirBocina();
  }

  ngOnDestroy(): void {
    clearInterval(this.intervalId);
  }

  obtenerCatalogoSensores() {
    this.httpClient.get<any[]>(this.hostapi + '/api/sensores/catalogo')
      .subscribe((sensores: any[]) => {
        this.sensores = sensores;
        this.generarDatos();
      });
  }

  obtenerHabitacionesOcupadas() {
    this.httpClient.get<any[]>(this.hostapi + '/api/habitaciones/ocupados')
      .subscribe((habitaciones: any[]) => {
        this.habitacionesOcupadas = habitaciones;
      });
  }

  iniciar() {
    this.detener();
    console.log("Imprimiendo signos vitales normales...");
    this.intervalId = setInterval(() => {
      this.generarDatos();
    }, 1000);
  }

  signosAltos() {
    this.detener();
    console.log("Imprimiendo signos vitales altos...");
    this.desactivarAlertas();
    this.activarAlertas();
    this.intervalId = setInterval(() => {
      this.generarDatos(true);
    }, 1000);
  }

  signosBajos() {
    this.detener();
    console.log("Imprimiendo signos vitales bajos...");
    this.desactivarAlertas();
    this.activarAlertas();
    this.intervalId = setInterval(() => {
      this.generarDatos(false, true);
    }, 1000);
  }

  estable() {
    this.detener();
    console.log("Imprimiendo signos vitales normales...");
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
    this.desactivarAlertas();
    clearInterval(this.intervalId);
  }

  generarDatos(signosAltos = false, signosBajos = false): Promise<void> {
    return new Promise((resolve, reject) => {
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
      this.sensores.forEach(sensor => {
        let valor = 0;
        switch (sensor.nombre) {
          case 'Frecuencia Respiratoria':
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
        promesasPublicacion.push(this.publicarMensaje(this.habitacionSeleccionada.id_habitacion, sensor, valor));
      });

      Promise.all(promesasPublicacion)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  publicarMensaje(idHabitacion: number, sensor: any, valor: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ruta = `SMMI/Habitacion${idHabitacion}${sensor.topico}`;
      const payloadObj: any = {
        id_sensor: sensor.id,
        valor: valor,
        id_habitacion: idHabitacion
      };
      const payload = JSON.stringify(payloadObj);
      this.mqttService.publish(ruta, payload).subscribe(() => {
        console.log(`Mensaje de ${sensor.topico} enviado con éxito a la habitación ${idHabitacion}-${sensor.nombre}`);
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

  subscribirSirena() {
    this.mqttService.observe('sirena/1').subscribe((message: IMqttMessage) => {
      if (message.payload.toString() === '1') {
        this.activarSirena();
      } else {
        this.desactivarSirena();
      }
    });
  }

  subscribirBocina() {
    this.mqttService.observe('bocina/1').subscribe((message: IMqttMessage) => {
      if (message.payload.toString() === '1') {
        this.activarBocina();
      } else {
        this.desactivarBocina();
      }
    });
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

  seleccionarHabitacion(event: Event) {
    const idHabitacion = (event.target as HTMLSelectElement).value;
    if (idHabitacion) {
      this.habitacionSeleccionada = this.habitacionesOcupadas.find(habitacion => habitacion.id_habitacion === Number(idHabitacion));
      if (this.habitacionSeleccionada) {
        this.generarDatos(); // <--- aqui haces la llamada que te proboca el envio cuando selc una habit
      }
    } else {
      this.habitacionSeleccionada = null;
    }
  }

}
