import { Characteristics } from '../Platform';
import { Service } from 'homebridge';
import HeatingSystem from './HeatingSystem';

export default class WaterHeatingSystem extends HeatingSystem {
    protected MIN_TEMP = 45;
    protected MAX_TEMP = 65;
    protected TARGET_MODES = [
        Characteristics.TargetHeatingCoolingState.AUTO,
        Characteristics.TargetHeatingCoolingState.OFF,
    ];

    protected registerMainService(): Service {
        const service = super.registerMainService();
        service.setPrimaryService(true);
        this.targetTemperature?.setProps({ minStep: 1 });
        return service;
    }
}