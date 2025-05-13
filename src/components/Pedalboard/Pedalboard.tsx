import React from 'react';
import classes from './Pedalboard.module.css';

interface PedalboardProps {
  children: React.ReactNode;
}

const Pedalboard: React.FC<PedalboardProps> = ({ children }) => {
  return <div className={classes.pedalboard}>{children}</div>;
};

export default Pedalboard;
