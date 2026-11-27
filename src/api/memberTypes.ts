import type {PetType,UserProfile} from '../types/index.ts';
import type {CareSlot} from '../data/care.ts';
export interface MemberSession {id:string;name:string;must_change_password:number;csrfToken:string}
export interface PetSpecies {
  id:string;slug:string;name:string;type:PetType|null;categoryName:string;status:string;images:Record<string,string>;
  careActions:{id:string;associationId:string;slot:CareSlot;label:string;description:string;icon:string}[];
  guides:{title:string;bodyText:string}[];
}
export interface Cultivation {
  id:string;species:PetSpecies;nickname:string;petMode:'individual'|'group';quantity:number;locationLabel:string;
  visualState:string;metrics:{stat1:number;stat2:number;stat3:number};status:'active'|'archived';ownershipConfirmed:boolean;
  startedAt:string;archivedAt:string|null;archiveReason:string|null;
}
export interface InstanceSchedule {
  id:string;cultivationId:string;nickname:string;speciesName:string;quantity:number;petStatus:string;ownershipConfirmed:boolean;
  slot:CareSlot;actionLabel:string;time:string;enabled:boolean;doneOn?:string;
}
export interface JournalEntry {
  id:string;cultivationId:string;petName:string;quantity:number|null;petMode:string|null;speciesName:string;speciesSlug:string;
  type:PetType|null;actionLabel:string;slot:CareSlot;createdAt:string;scheduleId:string|null;
}
export interface JournalActivity {id:string;batchId:string|null;createdAt:string;actionLabel:string;representedQuantity:number|null;entries:JournalEntry[]}
export interface JournalPage {items:JournalActivity[];total:number;hasMore:boolean}
export interface MemberBootstrap {
  profile:UserProfile;cultivations:Cultivation[];selectedCultivations:Record<PetType,string|null>;activePetType:PetType;
  schedules:InstanceSchedule[];careRecords:JournalActivity[];journalTotal:number;journalHasMore:boolean;multiPetReady:boolean;bulkCareMaxPets?:number;
  totalCareCount:number;totalPoints:number;streakDays:number;dailyRewardDate:string;createdCultivationId?:string;
  careResult?:{batchId:string|null;affectedPetCount:number;representedQuantity:number|null;updatedCultivationIds:string[];alreadyCompleted?:boolean};
}
