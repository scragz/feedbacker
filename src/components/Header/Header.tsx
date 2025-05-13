import React from 'react';
import classes from './Header.module.css';

const Header: React.FC = () => {
  return (
    <header className={classes.header}>
      <div className={classes.logo}>FEEDBACKER</div>
    </header>
  );
};

export default Header;
