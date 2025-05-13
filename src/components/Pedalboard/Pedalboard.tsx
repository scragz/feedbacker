import React from 'react';
import classes from './Pedalboard.module.css';

interface PedalboardProps {
  children: React.ReactNode;
}

const Pedalboard: React.FC<PedalboardProps> = ({ children, ...props }) => {
  return <div className={classes.pedalboard} {...props}>{children}</div>;
};

export default Pedalboard;
