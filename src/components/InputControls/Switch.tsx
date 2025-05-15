import React, { useRef, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import classNames from 'classnames';
import '../../lib/inputKnobs.js';
import './InputControls.module.css';

// Import assets
import switchLedImage from '../../assets/images/switch-led.png';
import switchMetalImage from '../../assets/images/switch-metal.png';
import switchSlideImage from '../../assets/images/switch-slide.png';

// Interface for the extended HTMLInputElement with inputKnobs methods
interface EnhancedInputElement extends HTMLInputElement {
  refresh?: () => void;
  redraw?: (force?: boolean) => void;
}

// Switch variant configurations
type SwitchVariant = 'metal' | 'slide' | 'led';

const getSwitchConfig = (variant: SwitchVariant) => {
  switch(variant) {
    case 'metal':
      return {
        src: switchMetalImage,
        sprites: 2,
        width: 64,
        height: 64
      };
    case 'slide':
      return {
        src: switchSlideImage,
        sprites: 2,
        width: 32,
        height: 32
      };
    case 'led':
    default:
      return {
        src: switchLedImage,
        sprites: 2,
        width: 16,
        height: 16
      };
  }
};

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  width?: number;
  height?: number;
  src?: string;
  sprites?: number;
  className?: string;
  label?: string;
  variant?: SwitchVariant;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  width,
  height,
  src,
  sprites,
  className = "",
  label,
  variant = 'led',
  disabled = false
}) => {
  const variantConfig = getSwitchConfig(variant);

  // Use provided values or fallback to variant defaults
  const actualSrc = src ?? variantConfig.src;
  const actualSprites = sprites ?? variantConfig.sprites;
  const actualWidth = width ?? variantConfig.width;
  const actualHeight = height ?? variantConfig.height;

  const inputRef = useRef<EnhancedInputElement>(null);
  const [displayChecked, setDisplayChecked] = useState(checked);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.checked = checked;
      
      // Update the displayed value
      setDisplayChecked(checked);

      // Force refresh of the switch
      setTimeout(() => {
        if (inputRef.current) {
          const switchInput = inputRef.current;
          if (switchInput.refresh) {
            switchInput.refresh();
          }
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
      const newChecked = e.target.checked;
      setDisplayChecked(newChecked);
      onChange(newChecked);
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
        data-width={actualWidth}
        data-height={actualHeight}
        data-sprites={actualSprites}
        data-src={actualSrc}
      />
      {label && <div className="switch-label" style={{ fontSize: '0.8rem', marginTop: '5px' }}>
        {typeof label === 'function' ? label(displayChecked) : label}
      </div>}
    </div>
  );
};

export default Switch;
