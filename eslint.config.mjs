import next from 'eslint-config-next'
export default [...next, { rules: { 'react-hooks/set-state-in-effect': 'off', 'react-hooks/purity': 'off' } }, { ignores: ['.next/**', 'node_modules/**'] }]
