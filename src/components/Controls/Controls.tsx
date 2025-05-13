import React from 'react';
import { Button, Group } from '@mantine/core'; // Using Mantine Button
import classes from './Controls.module.css';
import type { NodeType } from '../../audio/schema';

interface ControlsProps {
  onAddNode: (type: NodeType) => void;
  audioContextState: AudioContextState | null;
  onAudioResume: () => void;
}

const Controls: React.FC<ControlsProps> = ({ onAddNode, audioContextState, onAudioResume }) => {
  return (
    <div className={classes.controlsContainer}>
      <h3 className={classes.controlsTitle}>Controls</h3>
      {audioContextState === 'suspended' && (
        <Button onClick={onAudioResume} fullWidth variant="filled" color="orange" mb="sm">
          Resume Audio Context
        </Button>
      )}
      <Group className={classes.buttonGroup} grow>
        <Button onClick={() => onAddNode('gain')} variant="light">
          Add Gain
        </Button>
        <Button onClick={() => onAddNode('delay')} variant="light">
          Add Delay
        </Button>
        <Button onClick={() => onAddNode('biquad')} variant="light">
          Add Biquad
        </Button>
      </Group>
    </div>
  );
};

export default Controls;
