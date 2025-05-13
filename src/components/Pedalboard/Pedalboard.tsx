import React from 'react';
import classes from './Pedalboard.module.css';

interface PedalboardProps {
  children?: React.ReactNode; // Make children optional
}

const Pedalboard: React.FC<PedalboardProps> = ({ children, ...props }) => {
  return (
    <div className={classes.pedalboard} {...props}>
      {children} {/* Render children if provided */}
    </div>
  );
};

export default Pedalboard;
