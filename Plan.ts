export enum PlanName {
  free = 'free',
  pro = 'pro',
}

export class Plan {
  public readonly allowedDeviceCount: number
  public readonly asRetrievable: boolean

  constructor(public readonly planName: PlanName) {
    switch (planName) {
      case PlanName.pro:
        this.allowedDeviceCount = 200
        this.asRetrievable = true
        break
      case PlanName.free:
      default:
        this.allowedDeviceCount = 7
        this.asRetrievable = false
    }
  }
}
