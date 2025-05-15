import React, { useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import '../lib/inputKnobs.js';
import './InputControls.module.css';

// Helper to get size-based diameter
const getSizeDiameter = (size?: 'small' | 'medium' | 'large') => {
  switch(size) {
    case 'small': return 40;
    case 'large': return 80;
    default: return 64;
  }
};

interface KnobProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  diameter?: number;
  color?: string;
  bgcolor?: string;
  className?: string;
  onChange: (value: number) => void;
  sprites?: number;
  src?: string;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
}

export const Knob: React.FC<KnobProps> = ({
  min,
  max,
  value,
  step = 1,
  diameter,
  color = "#f00",
  bgcolor = "#000",
  className = "",
  onChange,
  sprites,
  src,
  label,
  size = 'medium',
  disabled = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Set knob attributes and value directly in useEffect
  useEffect(() => {
    if (inputRef.current) {
      // Set the value
      inputRef.current.value = String(value);

      // Make the knob input render as disabled
      if (disabled) {
        inputRef.current.style.opacity = '0.5';
        inputRef.current.style.pointerEvents = 'none';
      } else {
        inputRef.current.style.opacity = '1';
        inputRef.current.style.pointerEvents = 'auto';
      }

      // Force refresh of the knob using setTimeout to let the system initialize the knob
      setTimeout(() => {
        // Call refresh method added by the inputKnobs.js script
        const knobInput = inputRef.current as any;
        if (knobInput?.refresh) {
          knobInput.refresh();
        }
        if (knobInput?.redraw) {
          knobInput.redraw(true);
        }
      }, 0);
    }
  }, [value, disabled]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(Number(e.target.value));
    }
  };

  const actualDiameter = diameter ?? getSizeDiameter(size);

  return (
    <div className="knob-container" style={{ textAlign: 'center' }}>
      <input
        ref={inputRef}
        type="range"
        className={`input-knob ${className}`}
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onChange={handleChange}
        data-diameter={actualDiameter}
        data-fgcolor={color}
        data-bgcolor={bgcolor}
        data-sprites={sprites}
        data-src={src}
      />
      {label && <div className="knob-label" style={{ fontSize: '0.8rem', marginTop: '5px' }}>{label}</div>}
    </div>
  );
};

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  width?: number;
  height?: number;
  src?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  width = 24,
  height = 24,
  src,
  className = "",
  label,
  disabled = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.checked = checked;

      // Force refresh of the switch
      setTimeout(() => {
        const switchInput = inputRef.current as any;
        if (switchInput?.refresh) {
          switchInput.refresh();
        }
      }, 0);

      // Make the switch render as disabled
      if (disabled) {
        inputRef.current.style.opacity = '0.5';
        inputRef.current.style.pointerEvents = 'none';
      } else {
        inputRef.current.style.opacity = '1';
        inputRef.current.style.pointerEvents = 'auto';
      }
    }
  }, [checked, disabled]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  return (
    <div className="switch-container" style={{ display: 'inline-block', textAlign: 'center' }}>
      <input
        ref={inputRef}
        type="checkbox"
        className={`input-switch ${className}`}
        defaultChecked={checked}
        onChange={handleChange}
        data-width={width}
        data-height={height}
        data-src={src}
      />
      {label && <div className="switch-label" style={{ fontSize: '0.8rem', marginTop: '5px' }}>{label}</div>}
    </div>
  );
};

// Export all components
export default {
  Knob,
  Switch
};
