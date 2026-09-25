import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { analyzeProduce, analyzeProduceMock, type ScanOutcome } from '@/services/aiService';
import { colors } from '@/theme/colors';
import { PrimaryButton, SecondaryButton } from '@/components/agri/ui';
import { useI18n } from '@/i18n';
export default function Scanner(){
  const cameraRef = useRef<CameraView>(null);
  const [permission,requestPermission]=useCameraPermissions();
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<string>();
  const { t } = useI18n();

  const goToResult=(outcome:ScanOutcome)=>{router.replace({pathname:'/farmer/scan-result',params:{payload:JSON.stringify(outcome)}})};

  const runDemo=async()=>{setBusy(true);setStatus(undefined);try{goToResult({result:await analyzeProduceMock(),source:'mock',fallback:true,error:'Demo analysis — no live AI scan was performed'})}finally{setBusy(false)}};

  const analyze=async()=>{
    if(busy)return;
    if(!permission?.granted){await requestPermission();return;}
    setBusy(true);setStatus(undefined);
    try{
      // Real capture: ask the camera for a downscaled JPEG with base64 payload.
      let photo=await cameraRef.current?.takePictureAsync({quality:0.7,base64:true});
      let imageBase64=photo?.base64;
      // Keep uploads small: retake once at lower quality if the first frame is huge.
      if(imageBase64&&imageBase64.length>4_500_000){
        if(__DEV__)console.info('[scan] captured image too large, retaking at lower quality',{base64Chars:imageBase64.length});
        photo=await cameraRef.current?.takePictureAsync({quality:0.4,base64:true});
        imageBase64=photo?.base64;
      }
      if(!imageBase64){setStatus('Camera capture failed. Try again.');return;}
      const outcome=await analyzeProduce({imageBase64,mimeType:'image/jpeg'});
      if(__DEV__)console.info('[scan] outcome',{source:outcome.source,fallback:outcome.fallback,isCropPhoto:outcome.isCropPhoto,error:outcome.error??null});
      goToResult(outcome);
    }catch(reason){
      // Capture-level failure (camera busy, interrupted, etc.) — stay on the scanner.
      setStatus(reason instanceof Error?reason.message:'Camera capture failed. Try again.');
      if(__DEV__)console.warn('[scan] capture error',reason instanceof Error?reason.message:reason);
    }finally{setBusy(false)}
  };

  if(!permission)return <View style={s.center}><ActivityIndicator color={colors.green}/></View>;
  if(!permission.granted)return <View style={s.center}><Text style={s.title}>Camera access is required for live scanning.</Text><Text style={s.copy}>Use Demo Scan to continue with a simulated quality assessment.</Text><PrimaryButton label="Allow camera" onPress={requestPermission}/><SecondaryButton label="Use demo scan" onPress={runDemo}/></View>;
  return <View style={s.root}><CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back"/><View style={s.overlay}><Text style={s.label}>AI {t('scanner').toUpperCase()}</Text><Text style={s.copyLight}>Center the produce inside the frame</Text><View style={s.frame}/><View style={s.controls}>{busy?<View style={s.busy}><ActivityIndicator color="white"/><Text style={s.busyText}>Analyzing…</Text></View>:<><View style={s.crop}><Text style={s.cropText}>Auto-detect crop</Text></View><PrimaryButton label="Capture & analyze" onPress={analyze}/><SecondaryButton label="Use demo scan" onPress={runDemo}/></>}{status?<Text style={s.statusText}>{status}</Text>:null}</View></View></View>}
const s=StyleSheet.create({root:{flex:1,backgroundColor:colors.ink},overlay:{flex:1,justifyContent:'space-between',padding:24,paddingTop:70,backgroundColor:'rgba(0,0,0,.32)'},label:{color:'white',fontWeight:'900',letterSpacing:1.4,textAlign:'center'},copyLight:{color:'white',textAlign:'center',marginTop:-80},frame:{alignSelf:'center',width:'78%',aspectRatio:1,borderWidth:2,borderColor:'#A5E3A7',borderRadius:22,backgroundColor:'rgba(255,255,255,.04)'},controls:{gap:12},crop:{alignSelf:'center',paddingHorizontal:14,paddingVertical:8,borderRadius:18,backgroundColor:'rgba(255,255,255,.9)'},cropText:{fontWeight:'700',color:colors.ink},busy:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},busyText:{color:'white',fontWeight:'800'},statusText:{color:'#FFD7D7',textAlign:'center',fontSize:13},center:{flex:1,justifyContent:'center',alignItems:'center',padding:28,gap:16,backgroundColor:colors.cream},title:{fontSize:24,fontWeight:'900',color:colors.ink,textAlign:'center'},copy:{color:colors.muted,textAlign:'center',lineHeight:22}});
