import React from 'react';
import { Button, Group } from '@mantine/core'; // Using Mantine Button
import classes from './Controls.module.css';
import type { NodeType } from '../../audio/schema';

export interface ControlsProps {
  onAddNode: (type: NodeType) => void;
  audioContextState: AudioContextState | null;
  onAudioResume: () => void;
}

const Controls: React.FC<ControlsProps> = ({ onAddNode, audioContextState, onAudioResume }) => {
  const addGainNode = () => {
    onAddNode('gain');
  };
  const addDelayNode = () => {
    onAddNode('delay');
  };
  const addBiquadNode = () => {
    onAddNode('biquad');
  };
  const addNoiseNode = () => {
    onAddNode('noise');
  };
  return (
    <div className={classes.controlsContainer}>
      {audioContextState === 'suspended' && (
        <Button onClick={onAudioResume} fullWidth variant="filled" color="orange" mb="sm">
          Resume Audio Context
        </Button>
      )}
      <Group className={classes.buttonGroup} grow>
        <Button onClick={addGainNode} variant="light">
          Add Gain
        </Button>
        <Button onClick={addDelayNode} variant="light">
          Add Delay
        </Button>
        <Button onClick={addBiquadNode} variant="light">
          Add Biquad
        </Button>
        <Button onClick={addNoiseNode} variant="light">
          Add Noise
        </Button>
      </Group>
    </div>
  );
};

export default Controls;
