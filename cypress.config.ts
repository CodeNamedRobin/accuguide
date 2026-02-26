import { defineConfig } from 'cypress'
import coverageTask from '@cypress/code-coverage/task'

export default defineConfig({
  projectId: 'guhs88',
  e2e: {
    baseUrl: 'http://localhost:3000',
    port: 3001,
    setupNodeEvents(on, config) {
      coverageTask(on, config)
      return config
    },
  },

  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack',
    },
    setupNodeEvents(on, config) {
      coverageTask(on, config)
      return config
    },
  },
})
