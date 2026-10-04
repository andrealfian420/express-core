// Purpose: Start every BullMQ worker and attach lifecycle logging / dead-lettering to each.
// Caller: src/jobs/run-workers.ts.
// Dependencies: email.worker, system.worker, worker-logging.
// Main Functions: workers (default export).
// Side Effects: Importing starts the workers (they consume jobs immediately).
import emailWorker from './email.worker'
import systemWorker from './system.worker'
import { attachWorkerLogging } from './worker-logging'

const workers = [emailWorker, systemWorker]

workers.forEach(attachWorkerLogging)

export default workers
