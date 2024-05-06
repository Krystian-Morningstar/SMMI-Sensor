import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { EmuladorComponent } from './emulador/emulador.component';
import { MqttClientModule } from './mqtt.module';
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  declarations: [
    AppComponent,
    EmuladorComponent,
    ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    MqttClientModule,
    HttpClientModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
