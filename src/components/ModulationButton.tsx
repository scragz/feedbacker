import { Button, Group, Tooltip } from '@mantine/core';
import { type ButtonProps } from '@mantine/core';

interface ModulationButtonProps extends Omit<ButtonProps, 'onChange'> {
  label: string;
  active: boolean;
  color?: string;
  size?: 'xs' | 'sm' | 'md';
  onChange: (active: boolean) => void;
  disabled?: boolean;
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
  ...rest
}: ModulationButtonProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!active);
    }
  };

  return (
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

  return (
    <Group gap={4} justify="center">
      <ModulationButton
        label="LFO1"
        active={lfo1Active}
        color="blue"
        size="xs"
        disabled={disabled}
        onChange={(active) => { onModulationChange(parameter, 'lfo1', active, modulation?.lfo1?.amount ?? 0.5) }}
      />
      <ModulationButton
        label="LFO2"
        active={lfo2Active}
        color="indigo"
        size="xs"
        disabled={disabled}
        onChange={(active) => { onModulationChange(parameter, 'lfo2', active, modulation?.lfo2?.amount ?? 0.5) }}
      />
      <ModulationButton
        label="ENV1"
        active={env1Active}
        color="teal"
        size="xs"
        disabled={disabled}
        onChange={(active) => { onModulationChange(parameter, 'env1', active, modulation?.env1?.amount ?? 0.5) }}
      />
      <ModulationButton
        label="ENV2"
        active={env2Active}
        color="green"
        size="xs"
        disabled={disabled}
        onChange={(active) => { onModulationChange(parameter, 'env2', active, modulation?.env2?.amount ?? 0.5) }}
      />
    </Group>
  );
}

export default ModulationButtonGroup;
