import { Service } from 'homebridge';
import { Command } from 'overkiz-client';
import { Characteristics } from '../../../Platform';
import DomesticHotWaterProduction from '../DomesticHotWaterProduction';

export default class AtlanticDomesticHotWaterProductionV2_SPLIT_IOComponent extends DomesticHotWaterProduction {
    protected THERMOSTAT_CHARACTERISTICS = ['eco'];
    protected TARGET_MODES = [
        Characteristics.TargetHeatingCoolingState.AUTO,
        Characteristics.TargetHeatingCoolingState.HEAT,
        Characteristics.TargetHeatingCoolingState.OFF,
    ];

    protected registerMainService(): Service {
        const service = super.registerMainService();
        this.targetTemperature?.setProps({
            minValue: 50.0,
            maxValue: 54.5,
            validValues: [50, 52, 54, 54.5, 55],
            minStep: 2,
        });
        return service;
    }

    protected getTargetTemperatureCommands(value): Command | Array<Command> {
        const safeValue = value === 54 ? 54.5 : value;
        return new Command('setTargetTemperature', safeValue);
    }

    protected getTargetStateCommands(value): Command | Array<Command> | undefined {
        const commands = Array<Command>();
        if (this.targetState?.value === Characteristics.TargetHeatingCoolingState.OFF) {
            commands.push(new Command('setCurrentOperatingMode', { 'relaunch': 'off', 'absence': 'off' }));
        }
        switch (value) {
            case Characteristics.TargetHeatingCoolingState.AUTO:
                commands.push(new Command('setDHWMode', 'autoMode'));
                break;
            case Characteristics.TargetHeatingCoolingState.HEAT:
                if (this.eco?.value) {
                    commands.push(new Command('setDHWMode', 'manualEcoActive'));
                } else {
                    commands.push(new Command('setDHWMode', 'manualEcoInactive'));
                }
                break;
            case Characteristics.TargetHeatingCoolingState.OFF:
                commands.push(new Command('setCurrentOperatingMode', { 'relaunch': 'off', 'absence': 'on' }));
                break;
        }
        return commands;
    }

    protected getOnCommands(value): Command | Array<Command> {
        return new Command('setCurrentOperatingMode', { 'relaunch': value ? 'on' : 'off', 'absence': 'off' });
    }

    protected onStateChanged(name: string, value) {
        switch (name) {
            case 'io:MiddleWaterTemperatureState':
                this.currentTemperature?.updateValue(value);
                break;
            case 'core:TargetTemperatureState':
                this.targetTemperature?.updateValue(value);
                break;
            case 'io:DHWModeState':
            case 'core:OperatingModeState':
                this.postpone(this.computeStates);
                break;
        }
    }

    protected computeStates() {
        let targetState;
        const operatingMode = this.device.get('core:OperatingModeState');
        this.on?.updateValue(operatingMode.relaunch !== 'off');
        if (operatingMode.absence === 'off') {
            switch (this.device.get('io:DHWModeState')) {
                case 'autoMode':
                    targetState = Characteristics.TargetHeatingCoolingState.AUTO;
                    break;
                case 'manualEcoInactive':
                    this.eco?.updateValue(false);
                    targetState = Characteristics.TargetHeatingCoolingState.HEAT;
                    break;
                case 'manualEcoActive':
                    this.eco?.updateValue(true);
                    targetState = Characteristics.TargetHeatingCoolingState.HEAT;
                    break;
            }

            const powerHeatPumpState = this.device.get('io:PowerHeatPumpState');
            const powerHeatElectricalState = this.device.get('io:PowerHeatElectricalState');
            if (powerHeatElectricalState > 100 || powerHeatPumpState > 100) {
                this.currentState?.updateValue(Characteristics.CurrentHeatingCoolingState.HEAT);
            } else {
                this.currentState?.updateValue(Characteristics.CurrentHeatingCoolingState.OFF);
            }

        } else {
            targetState = Characteristics.TargetHeatingCoolingState.OFF;
            this.currentState?.updateValue(Characteristics.CurrentHeatingCoolingState.OFF);
        }
        if (this.targetState !== undefined && targetState !== undefined && this.isIdle) {
            this.targetState.updateValue(targetState);
        }
    }
}
