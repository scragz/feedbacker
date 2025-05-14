import { Box, Slider, Stack, Text, Title, Select } from '@mantine/core';
import {
  type AudioNodeInstance,
  type ParameterId,
  type ParameterValue,
  NODE_PARAMETER_DEFINITIONS,
  type ParameterDefinition,
} from '../audio/schema';
import { ModulationButtonGroup } from './ModulationButton';
import classes from './NodeInspector.module.css';

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

          return (
            <Box key={paramId} className={classes.parameterControl}>
              <Text size="sm" fw={500} mb={4}>
                {paramDef.label || paramId}
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
                <Slider
                  value={currentValue as number}
                  onChange={(value) => {
                    onParameterChange(selectedNode.id, paramId, value);
                  }}
                  min={paramDef.minValue}
                  max={paramDef.maxValue}
                  step={paramDef.step ?? (paramDef.type === 'integer' ? 1 : 0.01)}
                  scale={paramDef.scale === 'logarithmic' && paramDef.minValue && paramDef.maxValue && paramDef.minValue > 0 ?
                    (val) => {
                      // Safely calculate logarithmic scale
                      const min = paramDef.minValue ?? 0.001; // Safety minimum
                      const max = paramDef.maxValue ?? 1;
                      return Math.log10(val / min) / Math.log10(max / min) * 100;
                    } :
                    undefined}
                  label={(value) => {
                    if (typeof value === 'number') {
                      const precision = paramDef.type === 'integer' ? 0 :
                                      (paramDef.unit === '%' || paramDef.unit === 'dB' ? 1 : 2);
                      return `${value.toFixed(precision)} ${paramDef.unit ?? ''}`.trim();
                    }
                    return String(value);
                  }}
                />
              ) : paramDef.type === 'boolean' ? (
                <Text size="sm">
                  {paramDef.label}: {currentValue?.toString() ?? 'N/A'} (UI not implemented)
                </Text>
              ) : (
                <Text size="xs" c="dimmed" mt={2}>
                  Unsupported parameter type: {paramDef.type}
                </Text>
              )}
              {(paramDef.type === 'float' || paramDef.type === 'integer') && onModulationChange && (
                <ModulationButtonGroup
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
