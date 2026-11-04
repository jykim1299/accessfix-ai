import React from 'react';
import { createRoot } from 'react-dom/client';
import ModalApp from './ModalApp';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
createRoot(root).render(<ModalApp />);
