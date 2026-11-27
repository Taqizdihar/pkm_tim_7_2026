import {Bird,Fish,Sprout} from 'lucide-react';
import {useState} from 'react';
import type {Cultivation,PetSpecies} from '../../api/memberTypes.ts';
export const PET_CATEGORIES={tunas:'Tanaman',koki:'Ikan',kuning:'Ayam'} as const;
export const quantityLabel=(pet:{quantity:number;species:Pick<PetSpecies,'type'>})=>`${pet.quantity.toLocaleString('id-ID')} ${pet.species.type==='tunas'?'tanaman':'ekor'}`;
export const petDescription=(pet:Cultivation)=>`${pet.species.name} · ${pet.petMode==='group'?'Kelompok':'Individual'} · ${quantityLabel(pet)}`;

// Ownership lives in cultivation data; this renderer can later accept layered assets.
export function PetVisual({pet,compact=false}:{pet:{species:Pick<PetSpecies,'name'|'type'|'images'>;visualState?:string};compact?:boolean}){
  const image=pet.species.images[pet.visualState||'normal']||pet.species.images.normal;
  const [failedImage,setFailedImage]=useState('');
  const Icon=pet.species.type==='koki'?Fish:pet.species.type==='kuning'?Bird:Sprout;
  return <span className={`pet-visual ${compact?'pet-visual--compact':''}`}>{image&&failedImage!==image?<img src={image} alt={pet.species.name} width={260} height={260} draggable={false} onError={()=>setFailedImage(image)}/>:<span className="pet-visual__fallback"><Icon aria-hidden="true"/><span>{pet.species.name}</span></span>}</span>;
}
