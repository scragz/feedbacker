import { Box, Slider, Stack, Text, Title } from '@mantine/core';
import {
  type AudioNodeInstance,
  type ParameterId,
  type ParameterValue,
  NODE_PARAMETER_DEFINITIONS,
} from '../../audio/schema';
import classes from './NodeInspector.module.css';

interface NodeInspectorProps {
  selectedNode: AudioNodeInstance | null;
  onParameterChange: (nodeId: string, parameterId: ParameterId, value: ParameterValue) => void;
}

export function NodeInspector({
  selectedNode,
  onParameterChange,
}: NodeInspectorProps) {
  if (!selectedNode) {
    return (
      <Box className={classes.inspectorPlaceholder}>
        <Text>Select a node to inspect its parameters.</Text>
      </Box>
    );
  }

  const nodeDefinition = NODE_PARAMETER_DEFINITIONS[selectedNode.type];

  return (
    <Box className={classes.inspectorContainer} p="md">
      <Title order={4} mb="md">
        {selectedNode.label ?? selectedNode.type} Inspector
      </Title>
      <Stack>
        {Object.entries(selectedNode.parameters).map(([paramId, currentValue]) => {
          const paramDef = nodeDefinition[paramId];

          return (
            <Box key={paramId} className={classes.parameterControl}>
              <Text size="sm" fw={500} mb={4}>
                {paramDef.label || paramId}
              </Text>
              <Slider
                value={currentValue as number} // Assuming all params are numbers for now
                onChange={(value) =>{
                    onParameterChange(selectedNode.id, paramId, value)
                  }
                }
                min={paramDef.minValue}
                max={paramDef.maxValue}
                step={0.01}
                label={(value) => `${value.toFixed(paramDef.unit === '%' || paramDef.unit === 'dB' ? 1 : 2)} ${paramDef.unit ?? ''}`.trim()}
                // Consider adding marks if paramDef.marks is available
              />
              <Text size="xs" c="dimmed" mt={2}>
                {paramDef.label}
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
