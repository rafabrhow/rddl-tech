export type CompanyPdfBranding = {
  nomeFantasia?: string; razaoSocial?: string; documento?: string;
  telefone?: string; endereco?: string; logoDataUrl?: string;
};
export type CompanyPdfHeaderOptions = {
  width?: number; margin?: number; topBandHeight?: number;
  dividerY?: number; logoSize?: number; textGap?: number;
};

/** Cabeçalho oficial compartilhado dos PDFs do RDDL TECH. */
export async function drawCompanyPdfHeader(
  context: CanvasRenderingContext2D,
  company: CompanyPdfBranding,
  options: CompanyPdfHeaderOptions = {},
): Promise<number> {
  const width=options.width??1240, margin=options.margin??78;
  const bandHeight=options.topBandHeight??18, dividerY=options.dividerY??260;
  const logoSize=options.logoSize??150, textGap=options.textGap??32;
  const orange="#ef741f", dark="#172033", muted="#64748b";
  context.fillStyle="#ffffff"; context.fillRect(0,0,width,dividerY+2);
  context.fillStyle=orange; context.fillRect(0,0,width,bandHeight);
  let headerTextX=margin;
  if(company.logoDataUrl){
    try{
      const logo=new Image(); logo.crossOrigin="anonymous";
      await new Promise<void>((resolve,reject)=>{logo.onload=()=>resolve();logo.onerror=()=>reject(new Error("Logo indisponível"));logo.src=company.logoDataUrl!;});
      const ratio=Math.min(logoSize/logo.width,logoSize/logo.height);
      context.drawImage(logo,margin,48,logo.width*ratio,logo.height*ratio);
      headerTextX=margin+logoSize+textGap;
    }catch{/* O PDF permanece disponível sem a logomarca. */}
  }
  context.textAlign="left"; context.fillStyle=dark;
  context.font="700 38px Arial, sans-serif";
  context.fillText(company.nomeFantasia||company.razaoSocial||"Assistência técnica",headerTextX,100,width-headerTextX-margin);
  context.fillStyle=muted; context.font="400 20px Arial, sans-serif";
  let lineY=139;
  if(company.documento){context.fillText(`CPF/CNPJ: ${company.documento}`,headerTextX,lineY,width-headerTextX-margin);lineY+=35;}
  if(company.telefone){context.fillText(company.telefone,headerTextX,lineY,width-headerTextX-margin);lineY+=35;}
  if(company.endereco) context.fillText(company.endereco,headerTextX,lineY,width-headerTextX-margin);
  context.strokeStyle="#e2e8f0";context.lineWidth=2;context.beginPath();
  context.moveTo(margin,dividerY);context.lineTo(width-margin,dividerY);context.stroke();
  return dividerY;
}
