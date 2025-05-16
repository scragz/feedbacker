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
import { Knob } from './Controls/Knob';
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

          // Set knob colors based on parameter type
          const knobColor = isMainParameter ? '#f55' : '#5af';

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
                />
              ) : paramDef.type === 'float' || paramDef.type === 'integer' ? (
                <div className={classes.knobContainer}>
                  <Knob
                    min={paramDef.minValue ?? 0}
                    max={paramDef.maxValue ?? 100}
                    step={paramDef.step ?? (paramDef.type === 'integer' ? 1 : 0.01)}
                    value={currentValue as number}
                    onChange={(value) => {
                      onParameterChange(selectedNode.id, paramId, value);
                    }}
                    color={knobColor}
                    bgcolor="#222"
                    label={(value) => {
                      // Apply appropriate formatting based on parameter definition
                      let formattedValue = '';
                      if (typeof value === 'number') {
                        if (paramDef.type === 'integer') {
                          formattedValue = value.toFixed(0);
                        } else if (paramDef.unit === '%' || paramDef.unit === 'dB') {
                          formattedValue = value.toFixed(1);
                        } else {
                          formattedValue = value.toFixed(2);
                        }
                      } else {
                        formattedValue = String(value);
                      }
                      // Add unit if available
                      const unit = paramDef.unit ??  '';
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
