import { Characteristics, Services } from '../../Platform';
import { Characteristic } from 'homebridge';
import { Command, ExecutionState } from 'overkiz-client';
import HeatingSystem from '../HeatingSystem';

export default class AtlanticElectricalTowelDryer extends HeatingSystem {
    protected THERMOSTAT_CHARACTERISTICS = ['prog'];
    protected MIN_TEMP = 7;
    protected MAX_TEMP = 28;
    protected TARGET_MODES = [
        Characteristics.TargetHeatingCoolingState.AUTO,
        Characteristics.TargetHeatingCoolingState.OFF,
    ];

    protected drying: Characteristic | undefined;

    protected registerServices() {
        const services = super.registerServices();
        if (this.device.hasCommand('setTowelDryerBoostModeDuration')) {
            const boost = this.registerSwitchService('boost');
            services.push(boost);
        }
        if (this.device.hasCommand('setDryingDuration')) {
            const drying = this.registerService(Services.Switch, 'drying');
            this.drying = drying.getCharacteristic(Characteristics.On);

            this.drying?.onSet(this.setDrying.bind(this));
            services.push(drying);
        }
        return services;
    }

    protected getTargetStateCommands(value): Command | Array<Command> {
        switch (value) {
            case Characteristics.TargetHeatingCoolingState.AUTO:
                return new Command('setTowelDryerOperatingMode', this.prog?.value ? 'internal' : 'external');
            case Characteristics.TargetHeatingCoolingState.OFF:
                return new Command('setTowelDryerOperatingMode', 'standby');
        }
        return [];
    }

    protected getTargetTemperatureCommands(value): Command | Array<Command> | undefined {
        if (this.prog?.value) {
            return new Command('setDerogatedTargetTemperature', value);
        } else {
            return new Command('setTargetTemperature', value);
        }
    }

    protected getOnCommands(value): Command | Array<Command> {
        const commands = new Array<Command>();
        commands.push(new Command('setTowelDryerTemporaryState', value ? 'boost' : 'permanentHeating'));
        if (value) {
            commands.push(new Command('setTowelDryerBoostModeDuration', 10));
        }
        return commands;
    }

    protected async setDrying(value) {
        const commands = new Array<Command>();
        commands.push(new Command('setTowelDryerTemporaryState', value ? 'drying' : 'permanentHeating'));
        if (value) {
            commands.push(new Command('setDryingDuration', 60));
        }
        const action = await this.executeCommands(commands);
        action.on('update', (state) => {
            switch (state) {
                case ExecutionState.FAILED:
                    this.drying?.updateValue(!value);
                    break;
            }
        });
    }

    protected onStateChanged(name: string, value) {
        switch (name) {
            case 'core:TemperatureState': this.onTemperatureUpdate(value); break;
            case 'io:TowelDryerTemporaryStateState':
                this.on?.updateValue(value === 'boost');
                this.drying?.updateValue(value === 'drying');
                break;
            case 'core:TargetTemperatureState':
            case 'core:DerogatedTargetTemperatureState':
            case 'core:ComfortRoomTemperatureState':
            case 'core:EcoRoomTemperatureState':
            case 'core:OperatingModeState':
            case 'io:TargetHeatingLevelState':
                this.postpone(this.computeStates);
                break;
            default:
                super.onStateChanged(name, value);
                break;
        }
    }

    protected computeStates() {
        let targetTemperature = Number(this.device.get('core:ComfortRoomTemperatureState'));
        switch (this.device.get('io:TargetHeatingLevelState')) {
            case 'off':
                this.currentState?.updateValue(Characteristics.CurrentHeatingCoolingState.OFF);
                this.targetTemperature?.updateValue(this.device.get('core:TargetTemperatureState'));
                break;
            case 'eco':
                this.currentState?.updateValue(Characteristics.CurrentHeatingCoolingState.COOL);
                targetTemperature = targetTemperature - Number(this.device.get('core:EcoRoomTemperatureState'));
                break;
            case 'comfort':
                this.currentState?.updateValue(Characteristics.CurrentHeatingCoolingState.HEAT);
                break;
        }

        switch (this.device.get('core:OperatingModeState')) {
            case 'standby':
                this.targetState?.updateValue(Characteristics.TargetHeatingCoolingState.OFF);
                break;
            case 'internal':
                this.prog?.updateValue(true);
                this.targetState?.updateValue(Characteristics.TargetHeatingCoolingState.AUTO);
                if (Number(this.device.get('core:DerogatedTargetTemperatureState')) > 0) {
                    this.targetTemperature?.updateValue(this.device.get('core:DerogatedTargetTemperatureState'));
                } else {
                    this.targetTemperature?.updateValue(targetTemperature);
                }
                break;
            case 'external':
                this.prog?.updateValue(false);
                this.targetState?.updateValue(Characteristics.TargetHeatingCoolingState.AUTO);
                this.targetTemperature?.updateValue(targetTemperature);
                break;
        }
    }
}