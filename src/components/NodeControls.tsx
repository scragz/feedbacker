import React from 'react';
import { Button, Group } from '@mantine/core'; // Using Mantine Button
import classes from './NodeControls.module.css';
import type { NodeType } from '../audio/schema';

export interface NodeControlsProps {
  onAddNode: (type: NodeType) => void;
}

const NodeControls: React.FC<NodeControlsProps> = ({ onAddNode }) => {
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
  const addOscillatorNode = () => {
    onAddNode('oscillator');
  };
  const addWaveshaperNode = () => {
    onAddNode('waveshaper');
  };
  function addMicrophoneNode(): void {
    throw new Error('Function not implemented.');
  }

  return (
    <div className={classes.controlsContainer}>
      <Group className={classes.buttonGroup} grow wrap="wrap">
        <Button onClick={addGainNode} variant="light">
          Gain
        </Button>
        <Button onClick={addDelayNode} variant="light">
          Delay
        </Button>
        <Button onClick={addBiquadNode} variant="light">
          Filter
        </Button>
        <Button onClick={addNoiseNode} variant="light">
          Noise
        </Button>
        <Button onClick={addOscillatorNode} variant="light">
          Osc
        </Button>
        <Button onClick={addWaveshaperNode} variant="light">
          Shape
        </Button>
        <Button onClick={addMicrophoneNode} variant="light" disabled>
          Mic
        </Button>
      </Group>
    </div>
  );
};

export default NodeControls;
