const app = require('./app')
const startCronJobs = require('./jobs/cron')

startCronJobs()
const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
