import React from 'react';
import { Paper, Text, Title, Box, Group, Slider, NumberInput } from '@mantine/core';
import classes from './NodeEditor.module.css';
import type { AudioNodeInstance, ParameterValue } from '../audio/schema';

interface NodeEditorProps {
  selectedNode: AudioNodeInstance | null;
  onParameterChange?: (nodeId: string, paramId: string, value: ParameterValue) => void;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ selectedNode, onParameterChange }) => {
  if (!selectedNode) {
    return (
      <Paper p="md" shadow="xs" className={classes.editorContainer}>
        <Text ta="center" c="dimmed" className={classes.placeholderText}>
          Select a node to edit its parameters.
        </Text>
      </Paper>
    );
  }

  const { id, type, parameters } = selectedNode;
  const parameterEntries = Object.entries(parameters);

  const handleParameterChange = (paramId: string, value: ParameterValue) => {
    console.log(`[NodeEditor] Parameter change: Node ${id}, Param ${paramId}, Value ${value}`);
    if (onParameterChange) {
      onParameterChange(id, paramId, value);
    }
  };

  return (
    <Paper p="xl" shadow="lg" className={classes.editorContainer}>
      <Title order={3} ta="center" mb="lg" className={classes.editorTitle}>
        {type.toUpperCase()} (ID: {id})
      </Title>

      {parameterEntries.length === 0 ? (
        <Text ta="center" c="dimmed">This node has no parameters.</Text>
      ) : (
        <Box className={classes.parametersGrid}>
          {parameterEntries.map(([paramId, currentValue]) => {
            const isGain = paramId.toLowerCase().includes('gain') || paramId.toLowerCase().includes('level');
            const isFrequency = paramId.toLowerCase().includes('frequency') || paramId.toLowerCase().includes('freq');
            const isQ = paramId.toLowerCase() === 'q';
            const isDelayTime = paramId.toLowerCase().includes('time');
            const isBoolean = typeof currentValue === 'boolean'; // Example for a boolean toggle

            let min = 0, max = 1, step = 0.01, decimalScale = 2;
            if (isGain) { max = 2; }
            if (isFrequency) { min = 20; max = 20000; step = 1; decimalScale = 0; }
            if (isQ) { max = 30; step = 0.1; decimalScale = 1; }
            if (isDelayTime) { max = 2; step = 0.001; decimalScale = 3; }
            if (isBoolean) { /* Boolean specific handling if needed, e.g. for a Switch component */ }

            return (
              <Box key={paramId} className={classes.parameterControl}>
                <Text size="sm" fw={500} mb={4} className={classes.parameterLabel}>{paramId}</Text>
                <Group >
                  <Slider
                    value={Number(currentValue)}
                    onChange={(value) => { handleParameterChange(paramId, value); }}
                    min={min}
                    max={max}
                    step={step}
                    label={(value) => value.toFixed(decimalScale)}
                    className={classes.slider}
                    disabled={isBoolean} // Disable slider for booleans, could use a Switch instead
                    styles={{
                      label: { backgroundColor: 'var(--mantine-color-blue-filled)', color: 'white' },
                      thumb: { borderWidth: '2px', borderColor: 'var(--mantine-color-blue-filled)' },
                      bar: { backgroundColor: 'var(--mantine-color-blue-filled)' },
                    }}
                  />
                  <NumberInput
                    value={Number(currentValue)}
                    onChange={(value) => { handleParameterChange(paramId, Number(value)); }}
                    min={min}
                    max={max}
                    step={step}
                    decimalScale={decimalScale} // MODIFIED: Use decimalScale
                    hideControls
                    disabled={isBoolean}
                    className={classes.numberInput}
                    styles={{
                      input: {
                        textAlign: 'right',
                        backgroundColor: 'var(--mantine-color-dark-6)',
                        borderColor: 'var(--mantine-color-dark-4)',
                        color: 'var(--mantine-color-gray-0)',
                        fontFamily: 'Monaco, Courier, monospace', // CORRECTED: fontFamily string
                      }
                    }}
                  />
                  {/* TODO: Add a Mantine Switch for boolean parameters */}
                </Group>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
};

export default NodeEditor;
