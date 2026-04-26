// Worker Bootstrapper - exports all workers for easy imports
import emailWorker from './email.worker'
import systemWorker from './system.worker'

const workers = [emailWorker, systemWorker]

export default workers
