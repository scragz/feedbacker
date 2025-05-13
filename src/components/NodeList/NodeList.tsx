import React from 'react';
import { ScrollArea, Paper, Text, List, UnstyledButton } from '@mantine/core';
import classes from './NodeList.module.css';
import type { AudioNodeInstance } from '../../audio/schema';

interface NodeListProps {
  nodes: AudioNodeInstance[];
  selectedNodeId: string | null; // ADDED: To indicate which node is selected
  onSelectNode: (nodeId: string | null) => void; // ADDED: Callback for when a node is clicked
}

const NodeList: React.FC<NodeListProps> = ({ nodes, selectedNodeId, onSelectNode }) => {
  return (
    <Paper p="md" shadow="xs" className={classes.nodeListContainer}>
      <Text size="lg" ta="center" mb="sm" className={classes.nodeListTitle}>Current Nodes</Text>
      {nodes.length === 0 ? (
        <Text ta="center" c="dimmed">No nodes in the graph.</Text>
      ) : (
        <ScrollArea h={200}> {/* Mantine ScrollArea for better scrollbars */}
          <List listStyleType="none" spacing="xs" className={classes.list}>
            {nodes.map(node => (
              <List.Item
                key={node.id}
                // MODIFIED: Apply selected style and add onClick handler
                className={`${classes.listItem} ${node.id === selectedNodeId ? classes.selectedItem : ''}`}
              >
                {/* MODIFIED: Added braces to onClick handler */}
                <UnstyledButton onClick={() => { onSelectNode(node.id); }} className={classes.nodeButton}>
                  <Text fw={500}>{node.type.toUpperCase()} (ID: {node.id})</Text>
                  {Object.keys(node.parameters).length > 0 && (
                    <List listStyleType="disc" withPadding className={classes.nodeParameters}>
                      {Object.entries(node.parameters).map(([paramId, value]) => (
                        <List.Item key={paramId} className={classes.parameterItem}>
                          {paramId}: {String(value)}
                        </List.Item>
                      ))}
                    </List>
                  )}
                </UnstyledButton>
              </List.Item>
            ))}
          </List>
        </ScrollArea>
      )}
    </Paper>
  );
};

export default NodeList;
