export enum PlanName {
  FREE = 'free',
  PRO = 'pro',
}

export class Plan {
  public readonly allowedDeviceCount: number
  public readonly asRetrievable: boolean

  constructor(public readonly planName: PlanName) {
    switch (planName) {
      case PlanName.PRO:
        this.allowedDeviceCount = 200
        this.asRetrievable = true
        break
      case PlanName.FREE:
      default:
        this.allowedDeviceCount = 7
        this.asRetrievable = false
    }
  }
}
