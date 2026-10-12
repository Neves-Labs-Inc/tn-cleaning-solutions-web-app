import type { ScheduleAppointment } from "./overview.ts";
import { groupWeekReads, type AppointmentWeeks } from "./weeks.ts";

type LoadWeeks = (
  firstWeek: string,
  lastWeek: string,
) => Promise<AppointmentWeeks>;

type WeekRequest = {
  week: string;
  resolve: (appointments: ScheduleAppointment[]) => void;
  reject: (reason: unknown) => void;
};

// Week queries ask for one week each. The batcher collects the weeks asked for in the same tick
// (one render's queries, a focus refetch, a retry) and reads each run of them in one action
// call, since server actions run one at a time. Weeks a read covers but nobody asked for (cached
// weeks inside the span) are written to the cache too.
export class WeeksBatcher {
  readonly #loadWeeks: LoadWeeks;
  readonly #writeWeek: (week: string, appointments: ScheduleAppointment[]) => void;
  #pending: WeekRequest[] = [];

  constructor(
    loadWeeks: LoadWeeks,
    writeWeek: (week: string, appointments: ScheduleAppointment[]) => void,
  ) {
    this.#loadWeeks = loadWeeks;
    this.#writeWeek = writeWeek;
  }

  load(week: string): Promise<ScheduleAppointment[]> {
    return new Promise((resolve, reject) => {
      // A macrotask, so every query mounted in the same commit joins the batch.
      if (this.#pending.length === 0) setTimeout(() => this.#flush(), 0);
      this.#pending.push({ week, resolve, reject });
    });
  }

  async #flush(): Promise<void> {
    const requests = this.#pending;
    this.#pending = [];
    const reads = groupWeekReads(requests.map((request) => request.week));
    await Promise.all(reads.map((weeks) => this.#read(weeks, requests)));
  }

  async #read(weeks: string[], requests: WeekRequest[]): Promise<void> {
    const wanted = requests.filter((request) => weeks.includes(request.week));
    try {
      const loaded = await this.#loadWeeks(weeks[0], weeks[weeks.length - 1]);
      for (const [week, appointments] of Object.entries(loaded)) {
        if (!weeks.includes(week)) this.#writeWeek(week, appointments);
      }
      for (const request of wanted) request.resolve(loaded[request.week] ?? []);
    } catch (thrown) {
      // Each week's query records the error; the server log has the cause.
      for (const request of wanted) request.reject(thrown);
    }
  }
}

