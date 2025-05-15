import { Button, Tooltip, Text } from '@mantine/core';
import { type ButtonProps } from '@mantine/core';
import { Knob } from './InputControls/Knob';
import classes from './ModulationButton.module.css';

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
  ...rest
}: ModulationButtonProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!active);
    }
  };

  return (
    <div className={classes.modulationButtonWithKnob}>
      <Tooltip label={`${label} modulation ${active ? 'enabled' : 'disabled'}`} withArrow>
        <Button
          variant={active ? 'filled' : 'outline'}
          color={active ? color : 'gray'}
          size={size}
          onClick={handleClick}
          disabled={disabled}
          {...rest}
        >
          {label}
        </Button>
      </Tooltip>

      {showAmount && onAmountChange && (
        <div className={`${classes.knobContainer} ${!active ? classes.inactiveKnob : ''}`}>
          <Knob
            min={-1}
            max={1}
            step={0.01}
            value={amount}
            onChange={onAmountChange}
            color={active ? (amount >= 0 ? color : 'pink') : '#555'}
            bgcolor="#222"
            variant="small"
            label={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
            disabled={!active || disabled}
          />
          <Text size="xs" ta="center" className={classes.modulationLabel}>Amount</Text>
          {amount !== 0 && (
            <Text size="xs" ta="center" c="dimmed" className={classes.modulationLabelInfo}>
              {amount > 0 ? 'Raises' : 'Lowers'} values
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A group of modulation buttons (LFO1, LFO2, ENV1, ENV2)
 */
export function ModulationButtonGroup({
  parameter,
  modulation,
  onModulationChange,
  disabled = false,
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
    <div className={classes.modulationButtonGroup}>
      <ModulationButton
        label="LFO1"
        active={lfo1Active}
        color="blue"
        size="xs"
        disabled={disabled}
        amount={lfo1Amount}
        onAmountChange={(amount) => { onModulationChange(parameter, 'lfo1', lfo1Active, amount) }}
        onChange={(active) => { onModulationChange(parameter, 'lfo1', active, lfo1Amount) }}
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
      />
    </div>
  );
}

export default ModulationButtonGroup;
