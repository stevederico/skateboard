import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';

const config = await getSkateboardViteConfig();

// Force include react-router and its CommonJS dependencies in optimization for ESM transformation
config.optimizeDeps.include = [
  ...(config.optimizeDeps.include || []),
  'react-router',
  'react-router-dom',
  'cookie',
  'set-cookie-parser'
];

// Remove these from exclusions to allow optimization
config.optimizeDeps.exclude = config.optimizeDeps.exclude.filter(
  dep => !['react-router', 'react-router-dom', 'cookie', 'set-cookie-parser'].includes(dep)
);

export default config;
