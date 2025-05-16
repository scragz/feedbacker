import React, { useRef, useEffect, useState } from 'react';
import classNames from 'classnames';
import '../../lib/knob.js';
import './Controls.module.css';
import styles from './Knob.module.css';

// Define proper types for the Knob constructor
interface KnobInstance {
  setDimensions: (width: number, height: number) => void;
  val: (value?: number) => number;
  angle: (angle?: number) => number;
  doMouseScroll: (wheelDelta: number, timestamp: number, pageX: number, pageY: number) => void;
  doTouchStart: (touches: {pageX: number, pageY: number}[], timestamp: number) => void;
  doTouchMove: (touches: {pageX: number, pageY: number}[], timestamp: number, scale: number) => void;
  doTouchEnd: (timestamp: number) => void;
}

declare global {
  interface Window {
    Knob: new (
      inputEl: HTMLInputElement,
      callback: (knob: KnobInstance, indicator: {x: number, y: number, angle: number}, spriteOffset: {x: number, y: number}) => void
    ) => KnobInstance;
  }
}

// Knob variant configurations
type KnobVariant = 'large' | 'small';

const getKnobConfig = (variant: KnobVariant) => {
  switch(variant) {
    case 'small':
      return {
        width: 55,
        height: 55,
      };
    case 'large':
    default:
      return {
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
  bgcolor = "#222",
  className = "",
  onChange,
  label,
  variant = 'large',
  disabled = false
}) => {
  const variantConfig = getKnobConfig(variant);

  // Use provided values or fallback to variant defaults
  const actualWidth = width ?? variantConfig.width;
  const actualHeight = height ?? variantConfig.height;

  const inputRef = useRef<HTMLInputElement>(null);
  const knobInstanceRef = useRef<KnobInstance | null>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [displayValue, setDisplayValue] = useState<number>(value);
  // Track if the update is coming from the knob itself
  const isInternalUpdateRef = useRef(false);
  // Track the previous value for comparison
  const prevValueRef = useRef(value);
  // Track the current angle for the indicator
  const [angle, setAngle] = useState(0);

  // Initialize the knob when the component mounts
  useEffect(() => {
    if (!inputRef.current) return;

    const input = inputRef.current;

    const knobCallback = (knob: KnobInstance, _indicator: {x: number, y: number, angle: number}, _spriteOffset: {x: number, y: number}) => {
      const newValue = Number(input.value);

      // Update the indicator position
      if (indicatorRef.current) {
        // Get the knob's current angle
        const currentAngle = knob.angle();
        setAngle(currentAngle);
      }

      // Only update if the value actually changed
      if (newValue !== displayValue) {
        isInternalUpdateRef.current = true;
        setDisplayValue(newValue);
        onChange(newValue);
      }
    };

    knobInstanceRef.current = new window.Knob(input, knobCallback);

    // Set dimensions for the knob
    knobInstanceRef.current.setDimensions(actualWidth, actualHeight);

    // Set the initial value
    knobInstanceRef.current.val(value);

    // Add mouse wheel/scroll event handling
    const handleWheel = (e: WheelEvent) => {
      if (!disabled && knobInstanceRef.current) {
        e.preventDefault();
        knobInstanceRef.current.doMouseScroll(e.deltaY, Date.now(), e.clientX, e.clientY);
      }
    };

    input.addEventListener('wheel', handleWheel);

    return () => {
      input.removeEventListener('wheel', handleWheel);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualWidth, actualHeight, onChange, disabled]); // Intentionally omitting value and displayValue to prevent loops

  // Only update the knob value when the external value prop changes
  useEffect(() => {
    // Skip if this was triggered by the knob itself or if values are the same
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }

    // Only update if the value actually changed
    if (knobInstanceRef.current && value !== prevValueRef.current) {
      knobInstanceRef.current.val(value);
      setDisplayValue(value);
      prevValueRef.current = value;

      // Update angle after setting value
      const currentAngle = knobInstanceRef.current.angle();
      setAngle(currentAngle);
    }
  }, [value]);

  // Handle disabled state
  useEffect(() => {
    if (inputRef.current) {
      if (disabled) {
        inputRef.current.style.opacity = '0.5';
        inputRef.current.style.pointerEvents = 'none';
      } else {
        inputRef.current.style.opacity = '1';
        inputRef.current.style.pointerEvents = 'auto';
      }
    }
  }, [disabled]);

  // Setup touch and mouse event handlers
  useEffect(() => {
    if (!inputRef.current || !knobInstanceRef.current || disabled) return;

    const knob = knobInstanceRef.current;
    const element = inputRef.current;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const touches = [{ pageX: e.pageX, pageY: e.pageY }];
      knob.doTouchStart(touches, Date.now());

      const handleMouseMove = (e: MouseEvent) => {
        const touches = [{ pageX: e.pageX, pageY: e.pageY }];
        knob.doTouchMove(touches, Date.now(), 1);
      };

      const handleMouseUp = () => {
        knob.doTouchEnd(Date.now());
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touches = Array.from(e.touches).map(touch => ({
        pageX: touch.pageX,
        pageY: touch.pageY
      }));
      knob.doTouchStart(touches, Date.now());
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touches = Array.from(e.touches).map(touch => ({
        pageX: touch.pageX,
        pageY: touch.pageY
      }));
      knob.doTouchMove(touches, Date.now(), 1);
    };

    const handleTouchEnd = () => {
      knob.doTouchEnd(Date.now());
    };

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchmove', handleTouchMove);
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled]);

  // Calculate the position of the indicator based on the angle
  const indicatorStyle = {
    transform: `rotate(${angle}deg) translateX(-50%)`,
    transformOrigin: '50% 90%', // Position at the bottom center of the knob
    top: '5%',
    left: '50%',
    width: '4px',
    height: `${actualHeight * 0.4}px`,
    backgroundColor: color
  };

  return (
    <div className={styles['knob-container']} style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: `${actualWidth}px`, height: `${actualHeight}px` }}>
        <input
          ref={inputRef}
          type="range"
          className={classNames(styles.knob, className)}
          min={min}
          max={max}
          step={step}
          defaultValue={value}
          disabled={disabled}
          data-angle-start="-150"
          data-angle-end="150"
          data-angle-value-ratio={0.01}
          data-angle-slide-ratio="5"
          data-gesture-spin-enabled="true"
          data-gesture-slidex-enabled="true"
          data-gesture-slidey-enabled="true"
          data-gesture-scroll-enabled="true"
          data-sprite-width={actualWidth}
          data-sprite-height={actualHeight}
          data-fgcolor={color}
          data-bgcolor={bgcolor}
          style={{
            width: `${actualWidth}px`,
            height: `${actualHeight}px`,
            appearance: 'none',
            backgroundColor: bgcolor,
            borderRadius: '50%',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        />
        <div
          ref={indicatorRef}
          className={styles['knob-indicator']}
          style={indicatorStyle}
        />
      </div>
      {label && (
        <div className={styles['knob-label']} style={{ fontSize: '0.8rem', marginTop: '5px' }}>
          {typeof label === 'function' ? label(displayValue) : label}
        </div>
      )}
    </div>
  );
};

export default Knob;
