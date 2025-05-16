import React from 'react';
import { Slider as MantineSlider, Text, Stack, Box } from '@mantine/core';
import classes from './Slider.module.css';

export interface SliderProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  color?: string;
  label?: string | ((value: number) => string);
  disabled?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  labelPosition?: 'top' | 'bottom';
  unit?: string;
  marks?: { value: number; label?: React.ReactNode }[];
  thumbSize?: number;
  thumbColor?: string;
  showValue?: boolean;
  formatDisplayValue?: (value: number) => string;
  variant?: 'default' | 'parameter' | 'modulation';
}

export function Slider({
  min,
  max,
  value,
  step = 1,
  onChange,
  onChangeEnd,
  color = "mfnCyan",
  label,
  disabled = false,
  size = 'md',
  showLabel = true,
  labelPosition = 'top',
  unit = '',
  marks,
  thumbSize,
  thumbColor,
  showValue = true,
  formatDisplayValue,
  variant = 'default'
}: SliderProps) {

  // Format the display value with the unit
  const formattedValue = formatDisplayValue
    ? formatDisplayValue(value)
    : `${value}${unit}`;

  // Determine if we should use custom label function or the formatted value
  const sliderLabel = typeof label === 'function'
    ? label
    : (_value: number) => (showValue ? formattedValue : '');

  const baseSize = variant === 'parameter' ? 'xl' : size;

  // For modulation variant, we want to show positive/negative with different colors
  const determineColor = () => {
    if (disabled) return 'gray';
    if (variant === 'modulation') {
      return value >= 0 ? color : 'pink';
    }
    return color;
  };

  return (
    <Stack gap="xs" className={classes.sliderContainer}>
      {showLabel && label && labelPosition === 'top' && (
        <Text size="xs" className={classes.sliderLabel}>
          {typeof label === 'string' ? label : ''}
        </Text>
      )}

      <Box className={classes.sliderWrapper}>
        <MantineSlider
          value={value}
          onChange={onChange}
          onChangeEnd={onChangeEnd}
          min={min}
          max={max}
          step={step}
          color={determineColor()}
          size={baseSize}
          disabled={disabled}
          label={sliderLabel}
          labelAlwaysOn={showValue}
          marks={marks}
          thumbSize={thumbSize}
          radius="md"
          showLabelOnHover={true}
          thumbProps={{
            'aria-label': typeof label === 'string' ? label : 'slider',
            style: thumbColor ? { backgroundColor: thumbColor } : undefined
          }}
          className={`${classes.slider} ${classes[variant]}`}
        />
      </Box>

      {showLabel && label && labelPosition === 'bottom' && (
        <Text size="xs" className={classes.sliderLabel}>
          {typeof label === 'string' ? label : ''}
        </Text>
      )}

      {variant === 'modulation' && (
        <Text size="xs" ta="center" fw={300} className={classes.modulationDirection}>
          {value > 0 ? '+ up' : value < 0 ? '- down' : 'neutral'}
        </Text>
      )}
    </Stack>
  );
}

export default Slider;
