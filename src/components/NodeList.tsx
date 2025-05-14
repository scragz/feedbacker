import React from 'react';
import { ScrollArea, Paper, Text, List, UnstyledButton } from '@mantine/core';
import classes from './NodeList.module.css';
import type { AudioNodeInstance } from '../audio/schema';

interface NodeListProps {
  nodes: AudioNodeInstance[];
  selectedNodeId: string | null; // ADDED: To indicate which node is selected
  onSelectNode: (nodeId: string | null) => void; // ADDED: Callback for when a node is clicked
  onRemoveNode: (nodeId: string) => void; // ADDED: Callback for removing a node
}

const NodeList: React.FC<NodeListProps> = ({ nodes, selectedNodeId, onSelectNode, onRemoveNode }) => {
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
                <div className={classes.nodeItemContainer}> {/* Added container for layout */}
                  <UnstyledButton onClick={() => { onSelectNode(node.id); }} className={classes.nodeButton}>
                    <Text fw={500}>{node.label ?? node.type.toUpperCase()} (ID: {node.id.substring(0,5)}...)</Text>
                    {/* Removed parameter display from here, NodeInspector will handle it */}
                  </UnstyledButton>
                  {/* ADDED: Remove button */}
                  <UnstyledButton
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent onSelectNode from firing
                      onRemoveNode(node.id);
                    }}
                    className={classes.removeButton}
                    title="Remove Node"
                  >
                    &#x2715; {/* Multiplication X sign as a simple icon */}
                  </UnstyledButton>
                </div>
              </List.Item>
            ))}
          </List>
        </ScrollArea>
      )}
    </Paper>
  );
};

export default NodeList;
