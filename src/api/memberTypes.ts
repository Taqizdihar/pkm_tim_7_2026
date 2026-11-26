import type {PetType,UserProfile} from '../types/index.ts';
import type {CareRecord} from '../utils/careJournal.ts';
import type {CareSchedules} from '../utils/careSchedule.ts';
export interface MemberSession {id:string;name:string;must_change_password:number;csrfToken:string}
export interface Cultivation {id:string;slug:string;name:string;type:PetType;visual_state?:string;metrics:{stat1:number;stat2:number;stat3:number}}
export interface MemberBootstrap {
  profile:UserProfile;cultivations:Cultivation[];selected:Partial<Record<PetType,string>>;activePetType:PetType;
  schedules:CareSchedules;careRecords:CareRecord[];totalCareCount:number;totalPoints:number;streakDays:number;dailyRewardDate:string;
}
