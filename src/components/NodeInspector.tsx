import { Box, Stack, Text, Title, Select } from '@mantine/core';
import {
  type AudioNodeInstance,
  type ParameterId,
  type ParameterValue,
  NODE_PARAMETER_DEFINITIONS,
  type ParameterDefinition,
} from '../audio/schema';
import { ParameterModulation } from './ParameterModulation';
import classes from './NodeInspector.module.css';
import { Slider } from './Controls/Slider';
import { Switch } from './Controls/Switch';

interface NodeInspectorProps {
  selectedNode: AudioNodeInstance | null;
  onParameterChange: (nodeId: string, parameterId: ParameterId, value: ParameterValue) => void;
  onModulationChange?: (
    nodeId: string,
    parameterId: string,
    source: 'lfo1' | 'lfo2' | 'env1' | 'env2',
    enabled: boolean,
    amount?: number
  ) => void;
}

// Main parameters that should use large knobs
const MAIN_PARAMETERS = [
  'frequency', 'level', 'mix', 'cutoff', 'resonance', 'time', 'feedback', 'volume'
];

export function NodeInspector({
  selectedNode,
  onParameterChange,
  onModulationChange,
}: NodeInspectorProps) {
  if (!selectedNode) {
    return <></>;
  }

  const nodeDefinition = NODE_PARAMETER_DEFINITIONS[selectedNode.type];

  return (
    <Box className={classes.inspectorContainer} p="md">
      <Title order={4} mb="md">
        {selectedNode.label ?? selectedNode.type}
      </Title>
      <Stack>
        {Object.entries(selectedNode.parameters).map(([paramId, currentValue]) => {
          const paramDef = nodeDefinition[paramId] as ParameterDefinition<ParameterValue> | undefined;

          if (!paramDef) {
            console.warn(`Parameter definition not found for node type "${selectedNode.type}", parameter "${paramId}".`);
            return (
              <Box key={paramId} className={classes.parameterControl}>
                <Text c="red" size="sm">
                  Error: Definition not found for parameter "{paramId}".
                </Text>
              </Box>
            );
          }

          // Determine if it's a main parameter (use large knob) or a secondary parameter
          const isMainParameter = MAIN_PARAMETERS.includes(paramId);

          return (
            <Box key={paramId} className={classes.parameterControl}>
              <Text size="sm" fw={500} mb={4}>
                {paramDef.label}
              </Text>
              {paramDef.type === 'enum' && paramDef.enumValues ? (
                <Select
                  data={paramDef.enumValues.map((val) => ({ label: val, value: val }))}
                  value={currentValue as string}
                  onChange={(value) => {
                    if (value !== null) {
                      onParameterChange(selectedNode.id, paramId, value);
                    }
                  }}
                  allowDeselect={false}
                />                ) : paramDef.type === 'float' || paramDef.type === 'integer' ? (
                <div className={classes.controlContainer}>
                  <Slider
                    min={paramDef.minValue ?? 0}
                    max={paramDef.maxValue ?? 100}
                    step={paramDef.step ?? (paramDef.type === 'integer' ? 1 : 0.01)}
                    value={currentValue as number}
                    onChange={(value) => {
                      onParameterChange(selectedNode.id, paramId, value);
                    }}
                    color={isMainParameter ? "red" : "mfnCyan"}
                    variant="parameter"
                    label={paramDef.label}
                    formatDisplayValue={(value) => {
                      // Apply appropriate formatting based on parameter definition
                      let formattedValue = '';
                      if (paramDef.type === 'integer') {
                        formattedValue = value.toFixed(0);
                      } else if (paramDef.unit === '%' || paramDef.unit === 'dB') {
                        formattedValue = value.toFixed(1);
                      } else {
                        formattedValue = value.toFixed(2);
                      }
                      // Add unit if available
                      const unit = paramDef.unit ?? '';
                      return `${formattedValue}${unit}`;
                    }}
                  />
                </div>
              ) : paramDef.type === 'boolean' ? (
                <Switch
                  checked={currentValue as boolean}
                  onChange={(checked) => {
                    onParameterChange(selectedNode.id, paramId, checked);
                  }}
                  variant="led"
                  label={paramDef.label}
                />
              ) : (
                <Text size="xs" c="dimmed" mt={2}>
                  Unsupported parameter type: {paramDef.type}
                </Text>
              )}
              {(paramDef.type === 'float' || paramDef.type === 'integer') && onModulationChange && (
                <ParameterModulation
                  parameter={paramId}
                  modulation={selectedNode.modulation?.[paramId]}
                  onModulationChange={(paramId, source, enabled, amount) => {
                    onModulationChange(selectedNode.id, paramId, source, enabled, amount);
                  }}
                  baseValue={currentValue as number}
                  modulatedValue={
                    // If there's any active modulation for this parameter, show a simulated modulated value
                    // In reality, the actual modulated values are calculated in the AudioWorklet
                    (selectedNode.modulation?.[paramId]?.lfo1?.enabled ||
                     selectedNode.modulation?.[paramId]?.lfo2?.enabled ||
                     selectedNode.modulation?.[paramId]?.env1?.enabled ||
                     selectedNode.modulation?.[paramId]?.env2?.enabled) ?
                      // Simple simulation for display purposes
                      (() => {
                        const value = currentValue as number;
                        const mod = selectedNode.modulation?.[paramId];
                        if (!mod) return value;

                        // Calculate total modulation effect (simplified)
                        let totalEffect = 0;
                        // Use a stronger effect for UI display to make modulation more visible
                        if (mod.lfo1?.enabled) {
                          // Animate faster for a more noticeable effect on UI
                          totalEffect += mod.lfo1.amount * Math.sin(Date.now() / 400);
                        }
                        if (mod.lfo2?.enabled) {
                          // Different phase for LFO2
                          totalEffect += mod.lfo2.amount * Math.sin(Date.now() / 600 + Math.PI/2);
                        }
                        if (mod.env1?.enabled) totalEffect += mod.env1.amount * 0.7;
                        if (mod.env2?.enabled) totalEffect += mod.env2.amount * 0.7;

                        // Apply modulation effect (simplified simulation)
                        let modValue = value;
                        if (paramDef.scale === 'logarithmic' && value > 0) {
                          // For logarithmic parameters, apply in log space
                          const logVal = Math.log10(value);
                          const logMin = Math.log10(Math.max(0.000001, paramDef.minValue ?? 0.000001));
                          const logMax = Math.log10(paramDef.maxValue ?? 20000);
                          const logRange = logMax - logMin;
                          // Apply modulation more directly (similar to how it works in the processor)
                          const newLogVal = logVal + totalEffect * logRange;
                          modValue = Math.pow(10, newLogVal);
                        } else {
                          // For linear parameters - apply direct modulation similar to processor
                          const range = (paramDef.maxValue ?? 1) - (paramDef.minValue ?? 0);
                          modValue = value + totalEffect * range;
                        }

                        // Ensure we stay in parameter range
                        return Math.max(
                          paramDef.minValue ?? 0,
                          Math.min(paramDef.maxValue ?? 100, modValue)
                        );
                      })()
                    : undefined
                  }
                  unit={paramDef.unit}
                />
              )}
              <Text size="xs" c="dimmed" mt={2}>
                {paramDef.label} {paramDef.type !== 'enum' && paramDef.unit ? `(${paramDef.unit})` : ''}
              </Text>
            </Box>
          );
        })}
        {Object.keys(selectedNode.parameters).length === 0 && (
          <Text c="dimmed">This node has no configurable parameters.</Text>
        )}
      </Stack>
    </Box>
  );
}

export default NodeInspector;
