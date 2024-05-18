
export interface Habitacion {
    id_habitacion: number;
    nombre_habitacion: string;
    ocupado: boolean;
    config_sensores: ConfigSensore[];
}

export interface ConfigSensore {
    id: number;
    fecha_actualizacion: Date;
    max_valor: number;
    min_valor: number;
    topico_sensor: string;
}

// Converts JSON strings to/from your types
export class ConvertHabitacion {
    public static toHabitacion(json: string): Habitacion[] {
        return JSON.parse(json);
    }

    public static habitacionToJson(value: Habitacion[]): string {
        return JSON.stringify(value);
    }
}
