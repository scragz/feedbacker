import { Button, Tooltip, Text } from '@mantine/core';
import { type ButtonProps } from '@mantine/core';
import classNames from 'classnames';
import { Slider } from './Controls/Slider';
import classes from './ParameterModulation.module.css';

interface ModulationButtonProps extends Omit<ButtonProps, 'onChange'> {
  label: string;
  active: boolean;
  color?: string;
  size?: 'xs' | 'sm' | 'md';
  onChange: (active: boolean) => void;
  disabled?: boolean;
  amount?: number;
  onAmountChange?: (amount: number) => void;
  showAmount?: boolean;
  modulatedValue?: number; // Added prop for showing modulated value
  baseValue?: number; // Added prop for showing original value
  unit?: string; // Added prop for showing unit
}

/**
 * A button component for enabling/disabling modulation sources
 */
export function ModulationButton({
  label,
  active,
  color = 'blue',
  size = 'xs',
  onChange,
  disabled = false,
  amount = 0,
  onAmountChange,
  showAmount = true,
  modulatedValue,
  baseValue,
  unit,
  ...rest
}: ModulationButtonProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!active);
    }
  };

  // Format a number for display - limit decimal places
  const formatValue = (value: number | undefined) => {
    if (value === undefined) return '';

    // Different formatting based on value range
    if (Math.abs(value) < 0.01) return value.toFixed(4);
    if (Math.abs(value) < 1) return value.toFixed(2);
    if (Math.abs(value) > 1000) return value.toFixed(0);
    return value.toFixed(1);
  };

  // Calculate percent change if both values are provided
  const calculatePercentChange = () => {
    if (baseValue === undefined || modulatedValue === undefined || baseValue === 0) return null;
    const percentChange = ((modulatedValue - baseValue) / Math.abs(baseValue)) * 100;
    return `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(0)}%`;
  };

  const percentChange = calculatePercentChange();
  const isModulated = active && amount !== 0 && percentChange !== null;

  return (
    <div className={classes.modulationButtonWithKnob}>
      {showAmount && onAmountChange && (
        <div className={classNames(
          classes.controlContainer,
          {
            [classes.inactiveKnob]: !active,
            [classes.sliderPulse]: active && amount !== 0
          }
        )}>
          <Slider
            min={-1}
            max={1}
            step={0.01}
            value={amount}
            onChange={onAmountChange}
            color={active ? color : 'gray'}
            variant="modulation"
            disabled={!active || disabled}
            showLabel={false}
            formatDisplayValue={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
            size="sm"
          />
          <Text size="xs" ta="center" className={classes.modulationLabel}>Amount</Text>
          {amount !== 0 && (
            <Text size="xs" ta="center" c="dimmed" className={classes.modulationLabelInfo}>
              {amount > 0 ? 'Raises' : 'Lowers'} values
            </Text>
          )}
        </div>
      )}

      {/* Display for modulated values */}
      {modulatedValue !== undefined && (
        <div className={classes.valueDisplay}>
          {isModulated ? (
            <Text
              size="xs"
              className={classes.modulated}
              title={`Original: ${formatValue(baseValue)}${unit ?? ''}`}
            >
              {formatValue(modulatedValue)}{unit ?? ''} {percentChange}
            </Text>
          ) : (
            baseValue !== undefined && (
              <Text size="xs" c="dimmed">
                {formatValue(baseValue)}{unit ?? ''}
              </Text>
            )
          )}
        </div>
      )}

      <Tooltip label={`${label} modulation ${active ? 'enabled' : 'disabled'}`} withArrow>
        <Button
          variant={active ? 'filled' : 'outline'}
          color={active ? color : 'gray'}
          size={size}
          onClick={handleClick}
          disabled={disabled}
          className={isModulated ? classes.buttonPulse : undefined}
          {...rest}
        >
          {label}
        </Button>
      </Tooltip>
    </div>
  );
}

/**
 * A group of modulation buttons (LFO1, LFO2, ENV1, ENV2)
 */
export function ParameterModulation({
  parameter,
  modulation,
  onModulationChange,
  disabled = false,
  baseValue,
  modulatedValue,
  unit,
}: {
  parameter: string;
  modulation?: {
    lfo1?: { amount: number; enabled: boolean };
    lfo2?: { amount: number; enabled: boolean };
    env1?: { amount: number; enabled: boolean };
    env2?: { amount: number; enabled: boolean };
  };
  onModulationChange: (
    parameter: string,
    source: 'lfo1' | 'lfo2' | 'env1' | 'env2',
    enabled: boolean,
    amount?: number
  ) => void;
  disabled?: boolean;
  baseValue?: number; // Add the original parameter value
  modulatedValue?: number; // Add the modulated parameter value
  unit?: string; // Add the parameter unit
}) {
  const lfo1Active = modulation?.lfo1?.enabled ?? false;
  const lfo2Active = modulation?.lfo2?.enabled ?? false;
  const env1Active = modulation?.env1?.enabled ?? false;
  const env2Active = modulation?.env2?.enabled ?? false;

  const lfo1Amount = modulation?.lfo1?.amount ?? 0;
  const lfo2Amount = modulation?.lfo2?.amount ?? 0;
  const env1Amount = modulation?.env1?.amount ?? 0;
  const env2Amount = modulation?.env2?.amount ?? 0;

  return (
    <div className={classes.container}>
      <ModulationButton
        label="LFO1"
        active={lfo1Active}
        color="blue"
        size="xs"
        disabled={disabled}
        amount={lfo1Amount}
        onAmountChange={(amount) => { onModulationChange(parameter, 'lfo1', lfo1Active, amount) }}
        onChange={(active) => { onModulationChange(parameter, 'lfo1', active, lfo1Amount) }}
        baseValue={baseValue}
        modulatedValue={modulatedValue}
        unit={unit}
      />
      <ModulationButton
        label="LFO2"
        active={lfo2Active}
        color="indigo"
        size="xs"
        disabled={disabled}
        amount={lfo2Amount}
        onAmountChange={(amount) => { onModulationChange(parameter, 'lfo2', lfo2Active, amount) }}
        onChange={(active) => { onModulationChange(parameter, 'lfo2', active, lfo2Amount) }}
        baseValue={baseValue}
        modulatedValue={modulatedValue}
        unit={unit}
      />
      <ModulationButton
        label="ENV1"
        active={env1Active}
        color="teal"
        size="xs"
        disabled={disabled}
        amount={env1Amount}
        onAmountChange={(amount) => { onModulationChange(parameter, 'env1', env1Active, amount) }}
        onChange={(active) => { onModulationChange(parameter, 'env1', active, env1Amount) }}
        baseValue={baseValue}
        modulatedValue={modulatedValue}
        unit={unit}
      />
      <ModulationButton
        label="ENV2"
        active={env2Active}
        color="cyan"
        size="xs"
        disabled={disabled}
        amount={env2Amount}
        onAmountChange={(amount) => { onModulationChange(parameter, 'env2', env2Active, amount) }}
        onChange={(active) => { onModulationChange(parameter, 'env2', active, env2Amount) }}
        baseValue={baseValue}
        modulatedValue={modulatedValue}
        unit={unit}
      />
    </div>
  );
}

export default ParameterModulation;
