import React from 'react';
import classes from './Pedalboard.module.css';
import MatrixCanvas from '../MatrixCanvas'; // Import MatrixCanvas

interface PedalboardProps {
  children: React.ReactNode;
}

const Pedalboard: React.FC<PedalboardProps> = ({ children, ...props }) => {
  return (
    <div className={classes.pedalboard} {...props}>
      {children}
      <MatrixCanvas /> {/* Add MatrixCanvas here */}
    </div>
  );
};

export default Pedalboard;
