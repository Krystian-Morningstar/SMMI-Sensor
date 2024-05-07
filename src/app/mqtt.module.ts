import { NgModule } from '@angular/core';
import { MqttModule, IMqttServiceOptions } from 'ngx-mqtt';

export const MQTT_SERVICE_OPTIONS: IMqttServiceOptions = {
  hostname: '192.168.1.67',
  port: 8083,
  path: '/mqtt',
};

@NgModule({
  imports: [
    MqttModule.forRoot(MQTT_SERVICE_OPTIONS),
  ],
  exports: [
    MqttModule,
  ],
})
export class MqttClientModule { }
