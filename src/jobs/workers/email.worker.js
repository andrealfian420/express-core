const { Worker } = require('bullmq')
const redis = require('../../config/redis')
// const nodemailer = require('nodemailer')

new Worker(
  'email',
  async (job) => {
    if (job.name === 'sendVerificationEmail') {
      const { email, token } = job.data
      // TODO: Implement email sending logic using nodemailer

      console.log(`Sending verification email to ${email} with token: ${token}`)
    }
  },
  {
    connection: redis,
  },
)
