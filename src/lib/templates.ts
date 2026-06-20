import type { TemplateLayoutType } from '../types';

export type TemplateZoneDefinition = {
  key: string;
  label: string;
  area: string;
};

export type TemplateLayoutDefinition = {
  type: TemplateLayoutType;
  label: string;
  description: string;
  columns: string;
  rows: string;
  areas: string;
  zones: TemplateZoneDefinition[];
};

export const TEMPLATE_LAYOUTS: TemplateLayoutDefinition[] = [
  {
    type: 'full',
    label: 'Full screen',
    description: 'One content zone fills the display.',
    columns: '1fr',
    rows: '1fr',
    areas: '"main"',
    zones: [{ key: 'main', label: 'Main', area: 'main' }],
  },
  {
    type: 'split',
    label: '50/50 split',
    description: 'Two equal zones side by side.',
    columns: '1fr 1fr',
    rows: '1fr',
    areas: '"left right"',
    zones: [
      { key: 'left', label: 'Left', area: 'left' },
      { key: 'right', label: 'Right', area: 'right' },
    ],
  },
  {
    type: 'sidebar',
    label: 'Main + sidebar',
    description: 'Large main zone with a narrow side panel.',
    columns: '2fr 1fr',
    rows: '1fr',
    areas: '"main sidebar"',
    zones: [
      { key: 'main', label: 'Main', area: 'main' },
      { key: 'sidebar', label: 'Sidebar', area: 'sidebar' },
    ],
  },
  {
    type: 'grid',
    label: '2x2 grid',
    description: 'Four equal content zones.',
    columns: '1fr 1fr',
    rows: '1fr 1fr',
    areas: '"top_left top_right" "bottom_left bottom_right"',
    zones: [
      { key: 'top_left', label: 'Top left', area: 'top_left' },
      { key: 'top_right', label: 'Top right', area: 'top_right' },
      { key: 'bottom_left', label: 'Bottom left', area: 'bottom_left' },
      { key: 'bottom_right', label: 'Bottom right', area: 'bottom_right' },
    ],
  },
  {
    type: 'banner',
    label: 'Banner + main',
    description: 'A top banner with a large main area.',
    columns: '1fr',
    rows: '0.28fr 1fr',
    areas: '"banner" "main"',
    zones: [
      { key: 'banner', label: 'Banner', area: 'banner' },
      { key: 'main', label: 'Main', area: 'main' },
    ],
  },
  {
    type: 'canvas',
    label: 'Free canvas',
    description: 'Place and resize any number of zones freely.',
    columns: '1fr',
    rows: '1fr',
    areas: '"canvas"',
    zones: [],
  },
];

export function getTemplateLayout(type: TemplateLayoutType): TemplateLayoutDefinition {
  return TEMPLATE_LAYOUTS.find((layout) => layout.type === type) ?? TEMPLATE_LAYOUTS[1];
}
