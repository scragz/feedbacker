import React, { useRef, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import classNames from 'classnames';
import '../../lib/inputKnobs.js';
import './InputControls.module.css';

// Import assets
import knobXlImage from '../../assets/images/knob-xlarge.png';
import knobLgImage from '../../assets/images/knob-large.png';
import knobMdImage from '../../assets/images/knob-medium.png';
import knobSmImage from '../../assets/images/knob-small.png';

// Interface for the extended HTMLInputElement with inputKnobs methods
interface EnhancedInputElement extends HTMLInputElement {
  refresh?: () => void;
  redraw?: (force?: boolean) => void;
}

// Knob variant configurations
type KnobVariant = 'xlarge' | 'large' | 'medium' | 'small';

const getKnobConfig = (variant: KnobVariant) => {
  switch(variant) {
    case 'small':
      return {
        src: knobSmImage,
        sprites: 100,
        width: 27,
        height: 27,
      };
    case 'medium':
      return {
        src: knobMdImage,
        sprites: 100,
        width: 37,
        height: 37,
      };
    case 'large':
      return {
        src: knobLgImage,
        sprites: 100,
        width: 55,
        height: 55,
      };
    case 'xlarge':
      return {
        src: knobXlImage,
        sprites: 30,
        width: 89,
        height: 89,
      };
  }
};

interface KnobProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  width?: number;
  height?: number;
  color?: string;
  bgcolor?: string;
  className?: string;
  onChange: (value: number) => void;
  sprites?: number;
  src?: string;
  label?: string | ((value: number) => string);
  variant?: KnobVariant;
  disabled?: boolean;
}

export const Knob: React.FC<KnobProps> = ({
  min,
  max,
  value,
  step = 1,
  width,
  height,
  color = "#f00",
  bgcolor = "#000",
  className = "",
  onChange,
  sprites,
  src,
  label,
  variant = 'medium',
  disabled = false
}) => {
  const variantConfig = getKnobConfig(variant);

  // Use provided values or fallback to variant defaults
  const actualSrc = src ?? variantConfig.src;
  const actualSprites = sprites ?? variantConfig.sprites;
  const actualWidth = width ?? variantConfig.width;
  const actualHeight = height ?? variantConfig.height;

  const inputRef = useRef<EnhancedInputElement>(null);
  const [displayValue, setDisplayValue] = useState(value);

  // Set knob attributes and value directly in useEffect
  useEffect(() => {
    if (inputRef.current) {
      // Update the displayed value whenever the value prop changes
      setDisplayValue(value);

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
        if (inputRef.current) {
          const knobInput = inputRef.current;
          if (knobInput.refresh) {
            knobInput.refresh();
          }
          if (knobInput.redraw) {
            knobInput.redraw(true);
          }
        }
      }, 0);
    }
  }, [value, disabled]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      const newValue = Number(e.target.value);
      setDisplayValue(newValue);
      onChange(newValue);
    }
  };

  return (
    <div className="knob-container" style={{ textAlign: 'center' }}>
      <input
        ref={inputRef}
        type="range"
        className={classNames('input-knob', className)}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        data-src={actualSrc}
        data-width={actualWidth}
        data-height={actualHeight}
        data-sprites={actualSprites}
        data-fgcolor={color}
        data-bgcolor={bgcolor}
      />
      {label && (
        <div className="knob-label" style={{ fontSize: '0.8rem', marginTop: '5px' }}>
          {typeof label === 'function' ? label(displayValue) : label}
        </div>
      )}
    </div>
  );
};

export default Knob;
