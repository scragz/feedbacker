import React from 'react';
import { Paper, Text } from '@mantine/core';
import classes from './NodeEditor.module.css';
// import type { AudioNodeInstance } from '../../audio/schema'; // Will be needed later

interface NodeEditorProps {
  // selectedNode: AudioNodeInstance | null; // Will be needed later
}

const NodeEditor: React.FC<NodeEditorProps> = (/*{ selectedNode }*/) => {
  return (
    <Paper p="md" shadow="xs" className={classes.nodeEditorContainer}>
      <Text className={classes.placeholderText}>
        {/* {selectedNode ? `Editing ${selectedNode.type}` : 'Select a node to edit'} */}
        Node Editor / OLED Screen Area (Placeholder)
      </Text>
    </Paper>
  );
};

export default NodeEditor;
