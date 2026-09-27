import * as THREE from 'three';

// Pixel anchors refer to the original 1536 × 1024 transparent artwork.
// No image stretching, mirrored enemy sprites, or rank-dependent recoloring.
export function createPortraitShip(entry, texture, enemy = false) {
  const {bounds, muzzle, engines} = entry.art;
  const [x0,y0,x1,y1] = bounds;
  const cx=(x0+x1)/2, cy=(y0+y1)/2;
  const unit=entry.length/(x1-x0);
  const sign=enemy?-1:1;
  texture.colorSpace=THREE.SRGBColorSpace;
  const root=new THREE.Group();
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1536*unit,1024*unit),new THREE.MeshBasicMaterial({
    map:texture,transparent:true,alphaTest:.015,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
  }));
  plate.userData.owned=true;
  plate.position.set(sign*(768-cx)*unit,(cy-512)*unit,0);
  if(enemy){root.rotation.y=Math.PI;plate.rotation.y=Math.PI;}
  root.add(plate);
  function anchor(name,point){
    const object=new THREE.Object3D();object.name=name;
    object.position.set(sign*(point[0]-cx)*unit,(cy-point[1])*unit,.02);
    root.add(object);
  }
  anchor('muzzle',muzzle);
  anchor('shield_anchor',[cx,cy]);
  engines.forEach((point,i)=>anchor(`engine_${i+1}`,point));
  root.userData.portrait=true;
  root.userData.bodyHeight=(y1-y0)*unit;
  return root;
}
