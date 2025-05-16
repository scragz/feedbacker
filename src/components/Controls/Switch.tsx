import React, { useRef, useEffect } from 'react';
import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  label?: string | ((checked: boolean) => string);
  variant?: 'metal' | 'granite' | 'slide' | 'led' | 'power' | 'record';
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  className = "",
  label,
  variant = 'led',
  disabled = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Update the checked state when the prop changes
  useEffect(() => {
    if (inputRef.current && inputRef.current.checked !== checked) {
      inputRef.current.checked = checked;
    }
  }, [checked]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  return (
    <div className={`${styles.switchContainer} ${className}`}>
      <label className={`${styles.switch} ${styles[`switch${variant.charAt(0).toUpperCase() + variant.slice(1)}`]}`}>
        <input
          ref={inputRef}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        <span className={styles.switchSlider}></span>
      </label>
      {label && (
        <div className={styles.switchLabel}>
          {typeof label === 'function' ? label(checked) : label}
        </div>
      )}
    </div>
  );
};

export default Switch;
