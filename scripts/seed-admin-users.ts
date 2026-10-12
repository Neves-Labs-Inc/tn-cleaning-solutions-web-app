import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })

const localHostnames = ['127.0.0.1', 'localhost']

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Missing required environment variables')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SECRET_KEY:', supabaseSecretKey ? '✓' : '✗')
  process.exit(1)
}

const targetHost = URL.parse(supabaseUrl)?.hostname ?? null

// SECURITY — do not remove. This script resets known-plaintext passwords and upserts seed rows
// with a secret (formerly service-role) key, which bypasses RLS. On 2026-09-18 it was run twice against the LIVE
// project because `.env.local` points at production and nothing stopped it. The guard fails
// closed: a URL that will not parse is treated as remote, not as local.
if (targetHost === null || !localHostnames.includes(targetHost)) {
  console.error('❌ Refusing to seed: target is not a local Supabase stack.')
  console.error(`   NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl}`)
  console.error(`   resolved host: ${targetHost ?? '<unparseable>'}`)
  console.error(`   allowed hosts: ${localHostnames.join(', ')}`)
  console.error('   This script resets passwords and writes rows with a secret (formerly service-role) key.')
  console.error('   Take the URL and secret key from `npx supabase status` and pass them in:')
  console.error(
    '   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<local secret> npm run seed:admin'
  )
  process.exit(1)
}

console.log(`🎯 Seed target: ${supabaseUrl} (host ${targetHost})\n`)

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

interface User {
  email: string
  password: string
  fullName: string
  role: 'admin' | 'employee'
  phone?: string
}

interface SeededRowCheck {
  label: string
  table: string
  match: Record<string, string>
  minimum: number
}

const users: User[] = [
  {
    email: 'franklin.neves.filho@gmail.com',
    password: 'admin123',
    fullName: 'Franklin Neves Filho',
    role: 'admin',
  },
  {
    email: 'franklin.neves.filho+employee@gmail.com',
    password: 'employee123',
    fullName: 'Franklin Neves Filho (Employee)',
    role: 'employee',
    phone: '(615) 555-0124',
  },
  {
    email: 'sarah.johnson@tncleaningsolutions.com',
    password: 'employee123',
    fullName: 'Sarah Johnson',
    role: 'employee',
    phone: '(615) 555-0123',
  },
]

const today = new Date().toISOString().split('T')[0]

const seededRowChecks: SeededRowCheck[] = [
  {
    label: 'public.employees',
    table: 'employees',
    match: {},
    minimum: users.length,
  },
  {
    label: "public.clients name='Johnson Family'",
    table: 'clients',
    match: { name: 'Johnson Family' },
    minimum: 1,
  },
  {
    label: "public.jobs name='Standard House Cleaning'",
    table: 'jobs',
    match: { name: 'Standard House Cleaning' },
    minimum: 1,
  },
  {
    label: `public.appointments scheduled_date=${today} 09:00`,
    table: 'appointments',
    match: { scheduled_date: today, scheduled_start_time: '09:00:00' },
    minimum: 1,
  },
  {
    label: 'public.appointment_employees',
    table: 'appointment_employees',
    match: {},
    minimum: 1,
  },
]

const failures: string[] = []

function fail(message: string) {
  failures.push(message)
  console.error(`   ❌ ${message}`)
}

async function seedUsers() {
  console.log('🌱 Seeding users...\n')

  const { data: existing, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    fail(`Could not list auth users: ${listError.message}`)
    return
  }

  for (const user of users) {
    const roleEmoji = user.role === 'admin' ? '👑' : '👤'
    console.log(`${roleEmoji} Processing ${user.email} (${user.role})...`)

    const existingUser = existing.users.find((u) => u.email === user.email)

    if (existingUser) {
      console.log(`   ⚠️  User already exists, updating...`)

      const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        app_metadata: { role: user.role },
        password: user.password,
      })

      if (updateError) {
        fail(`Failed to update user ${user.email}: ${updateError.message}`)
        continue
      }

      const { error: employeeError } = await supabase.from('employees').upsert(
        {
          user_id: existingUser.id,
          full_name: user.fullName,
          phone: user.phone || null,
          is_active: true,
        },
        {
          onConflict: 'user_id',
        }
      )

      if (employeeError) {
        fail(`Failed to upsert employee record for ${user.email}: ${employeeError.message}`)
        continue
      }

      console.log(`   ✅ Updated successfully`)
      continue
    }

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      app_metadata: { role: user.role },
    })

    if (createError) {
      fail(`Failed to create user ${user.email}: ${createError.message}`)
      continue
    }

    if (!newUser.user) {
      fail(`Created user ${user.email} but the Admin API returned no user record`)
      continue
    }

    const { error: employeeError } = await supabase.from('employees').insert({
      user_id: newUser.user.id,
      full_name: user.fullName,
      phone: user.phone || null,
      is_active: true,
    })

    if (employeeError) {
      fail(`Failed to create employee record for ${user.email}: ${employeeError.message}`)
      continue
    }

    console.log(`   ✅ Created successfully`)
  }
}

async function seedTestData() {
  console.log('\n🧪 Creating test appointment data...\n')

  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    fail(`Could not list auth users while seeding test data: ${listError.message}`)
    return
  }

  const sarahAuthUser = authUsers.users.find(
    (u) => u.email === 'sarah.johnson@tncleaningsolutions.com'
  )

  if (!sarahAuthUser) {
    fail('Cannot seed test data: sarah.johnson@tncleaningsolutions.com is missing from auth.users')
    return
  }

  const { data: sarahEmployee, error: sarahEmployeeError } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', sarahAuthUser.id)
    .maybeSingle()

  if (sarahEmployeeError) {
    fail(`Failed to read Sarah's employee record: ${sarahEmployeeError.message}`)
    return
  }

  if (!sarahEmployee) {
    fail("Cannot seed test data: Sarah's public.employees row is missing")
    return
  }

  const { data: existingClient, error: clientReadError } = await supabase
    .from('clients')
    .select('id')
    .eq('name', 'Johnson Family')
    .maybeSingle()

  if (clientReadError) {
    fail(`Failed to read test client: ${clientReadError.message}`)
    return
  }

  let clientId: string

  if (existingClient) {
    clientId = existingClient.id
    console.log('   ℹ️  Using existing test client: Johnson Family')
  } else {
    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: 'Johnson Family',
        email: 'mjohnson@email.com',
        phone: '(615) 555-0200',
        address: '123 Main St, Nashville, TN 37201',
        notes: 'Weekly cleaning, has a friendly golden retriever named Max',
        is_active: true,
      })
      .select('id')
      .single()

    if (clientError) {
      fail(`Failed to create client Johnson Family: ${clientError.message}`)
      return
    }

    clientId = newClient.id
    console.log('   ✅ Created test client: Johnson Family')
  }

  const { data: existingJob, error: jobReadError } = await supabase
    .from('jobs')
    .select('id')
    .eq('name', 'Standard House Cleaning')
    .maybeSingle()

  if (jobReadError) {
    fail(`Failed to read test job: ${jobReadError.message}`)
    return
  }

  let jobId: string

  if (existingJob) {
    jobId = existingJob.id
    console.log('   ℹ️  Using existing test job: Standard House Cleaning')
  } else {
    const { data: newJob, error: jobError } = await supabase
      .from('jobs')
      .insert({
        name: 'Standard House Cleaning',
        description:
          'Complete house cleaning including kitchen, bathrooms, living areas, and bedrooms',
        hourly_rate_cents: 4500,
        estimated_duration_minutes: 120,
      })
      .select('id')
      .single()

    if (jobError) {
      fail(`Failed to create job Standard House Cleaning: ${jobError.message}`)
      return
    }

    jobId = newJob.id
    console.log('   ✅ Created test job: Standard House Cleaning')
  }

  const { data: existingAppointment, error: appointmentReadError } = await supabase
    .from('appointments')
    .select('id')
    .eq('client_id', clientId)
    .eq('job_id', jobId)
    .eq('scheduled_date', today)
    .eq('scheduled_start_time', '09:00:00')
    .maybeSingle()

  if (appointmentReadError) {
    fail(`Failed to read test appointment: ${appointmentReadError.message}`)
    return
  }

  let appointmentId: string

  if (existingAppointment) {
    appointmentId = existingAppointment.id
    console.log(`   ℹ️  Using existing test appointment for today (${today})`)
  } else {
    const { data: newAppointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        client_id: clientId,
        job_id: jobId,
        scheduled_date: today,
        scheduled_start_time: '09:00:00',
        scheduled_end_time: '11:00:00',
        status: 'scheduled',
        notes:
          'First visit - client will leave the key under the front door mat. The dog is friendly but energetic.',
      })
      .select('id')
      .single()

    if (appointmentError) {
      fail(`Failed to create test appointment: ${appointmentError.message}`)
      return
    }

    appointmentId = newAppointment.id
    console.log(`   ✅ Created test appointment for today (${today}) at 9:00 AM`)
  }

  // appointment_employees has no unique constraint on (appointment_id, employee_id), so an
  // unguarded insert duplicates the assignment on every run. Read first, exactly as the client,
  // job and appointment steps above do.
  const { data: existingAssignment, error: assignmentReadError } = await supabase
    .from('appointment_employees')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('employee_id', sarahEmployee.id)
    .maybeSingle()

  if (assignmentReadError) {
    fail(`Failed to read Sarah's appointment assignment: ${assignmentReadError.message}`)
    return
  }

  if (existingAssignment) {
    console.log('   ℹ️  Sarah already assigned')
    return
  }

  const { error: sarahAssignError } = await supabase.from('appointment_employees').insert({
    appointment_id: appointmentId,
    employee_id: sarahEmployee.id,
  })

  if (sarahAssignError) {
    fail(`Failed to assign Sarah to the test appointment: ${sarahAssignError.message}`)
    return
  }

  console.log('   ✅ Assigned Sarah to appointment')
}

async function verifySeededRows() {
  console.log('\n🔎 Re-reading what the seed claims to have written...\n')

  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    fail(`Could not verify auth.users: ${listError.message}`)
  } else {
    console.log(`   auth.users: ${authUsers.users.length}`)

    if (authUsers.users.length < users.length) {
      fail(`auth.users has ${authUsers.users.length} row(s), expected at least ${users.length}`)
    }
  }

  for (const check of seededRowChecks) {
    let query = supabase.from(check.table).select('*', { count: 'exact', head: true })

    for (const [column, value] of Object.entries(check.match)) {
      query = query.eq(column, value)
    }

    const { count, error } = await query

    if (error) {
      fail(`Could not verify ${check.label}: ${error.message}`)
      continue
    }

    console.log(`   ${check.label}: ${count ?? 0}`)

    if ((count ?? 0) < check.minimum) {
      fail(`${check.label} has ${count ?? 0} row(s), expected at least ${check.minimum}`)
    }
  }
}

async function main() {
  await seedUsers()
  await seedTestData()
  await verifySeededRows()

  console.log('\n📋 Test Users:')
  console.log('   Admin:')
  console.log('   - franklin.neves.filho@gmail.com / admin123')
  console.log('\n   Employees:')
  console.log('   - franklin.neves.filho+employee@gmail.com / employee123')
  console.log('   - sarah.johnson@tncleaningsolutions.com / employee123')
}

main()
  .then(() => {
    if (failures.length > 0) {
      console.error(`\n💥 Seed FAILED — ${failures.length} problem(s):`)

      for (const failure of failures) {
        console.error(`   - ${failure}`)
      }

      process.exit(1)
    }

    console.log('\n✨ Done! All users and test data are in place.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error)
    process.exit(1)
  })
