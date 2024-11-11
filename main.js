// 1. 필요한 Three.js 모듈 임포트
import * as THREE from '../node_modules/three/build/three.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

class LiverViewer {
    // 2. 클래스 생성자 - 초기화 순서 정의
    constructor() {
        this.isDarkMode = true;  // 다크모드 기본값 설정
        if (!document.getElementById('container')) {
            throw new Error('Container element not found');
        }
        // 초기화 메서드들 순차적 호출
        this.initialize();        // 기본 Three.js 설정
        this.createNoiseTexture(); // 노이즈 텍스처 생성
        this.createScene();       // 씬 구성
        this.createMaterials();   // 재질 생성
        this.loadMesh();          // 3D 모델 로드
        this.setupControls();     // 컨트롤 설정
        this.animate();           // 애니메이션 시작
    }

    // 3. Perlin Noise 관련 유틸리티 함수들
    // 3.1 보간 함수 - 값들 사이의 부드러운 전환을 위한 수식
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    // 3.2 그라데이션 함수 - 2D 공간의 특정 지점에 대한 무작위값 생성
    grad(x, y) {
        const random = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
        return random - Math.floor(random);
    }

    // 3.3 스무스 노이즈 - 부드러운 노이즈 패턴 생성
    smoothNoise(x, y) {
        // 격자 좌표 계산
        const x0 = Math.floor(x);
        const x1 = x0 + 1;
        const y0 = Math.floor(y);
        const y1 = y0 + 1;
        
        // 보간 가중치 계산
        const sx = this.fade(x - x0);
        const sy = this.fade(y - y0);
        
        // 네 모서리의 그라디언트 값 계산
        const n00 = this.grad(x0, y0);
        const n10 = this.grad(x1, y0);
        const n01 = this.grad(x0, y1);
        const n11 = this.grad(x1, y1);
        
        // 보간을 통한 최종값 계산
        const nx0 = n00 * (1 - sx) + n10 * sx;
        const nx1 = n01 * (1 - sx) + n11 * sx;
        return nx0 * (1 - sy) + nx1 * sy;
    }

    // 3.4 프랙탈 노이즈 - 여러 레이어의 노이즈를 합성
    fractalNoise(x, y, octaves) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        // 여러 레이어의 노이즈를 중첩
        for(let i = 0; i < octaves; i++) {
            // 각 레이어마다 다른 주파수와 진폭으로 노이즈 생성
            value += amplitude * this.smoothNoise(x * frequency, y * frequency);
            maxValue += amplitude;
            amplitude *= 0.5;    // 진폭을 절반으로 줄임
            frequency *= 2;      // 주파수를 두 배로 증가
        }
        
        // 정규화된 최종 노이즈 값 반환
        return value / maxValue;
    }

    // 4. 노이즈 텍스처 생성 메서드
    createNoiseTexture() {
      const size = 1024;  // 텍스처 해상도 설정
      
      // 4.1 건강한 간을 위한 부드러운 노이즈 텍스처 생성
      const healthyNoiseData = new Uint8Array(size * size * 4);  // RGBA 포맷을 위한 배열
      for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
              const i = (y * size + x) * 4;  // RGBA 각 채널의 인덱스 계산
              // 큰 스케일(150)과 적은 옥타브(4)로 부드러운 패턴 생성
              const baseNoise = this.fractalNoise(x / 150, y / 150, 4);
              const noiseValue = baseNoise * 0.3 + 0.7;  // 노이즈 범위 조정 (0.7~1.0)
              
              // 모든 RGB 채널에 동일한 값 적용 (그레이스케일)
              healthyNoiseData[i] = noiseValue * 255;     // R
              healthyNoiseData[i + 1] = noiseValue * 255; // G
              healthyNoiseData[i + 2] = noiseValue * 255; // B
              healthyNoiseData[i + 3] = 255;              // A (완전 불투명)
          }
      }
      
      // 4.2 간경화를 위한 복잡한 노이즈 텍스처 생성
      const fibrosisNoiseData = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
              const i = (y * size + x) * 4;
              // 두 개의 다른 스케일 노이즈를 조합
              const baseNoise = this.fractalNoise(x / 100, y / 100, 6);    // 큰 패턴
              const detailNoise = this.fractalNoise(x / 30, y / 30, 3);    // 작은 디테일
              const noiseValue = (baseNoise * 0.7 + detailNoise * 0.3);    // 패턴 혼합
              
              // RGB 채널에 서로 다른 값을 적용하여 색상 변화 생성
              const r = Math.floor(255 * (0.6 + noiseValue * 0.4));  // 빨강 채널 강조
              const g = Math.floor(255 * (0.2 + noiseValue * 0.2));  // 초록 채널 억제
              const b = Math.floor(255 * (0.2 + noiseValue * 0.1));  // 파랑 채널 억제
              
              fibrosisNoiseData[i] = r;
              fibrosisNoiseData[i + 1] = g;
              fibrosisNoiseData[i + 2] = b;
              fibrosisNoiseData[i + 3] = 255;
          }
      }

      // 4.3 텍스처 생성 유틸리티 함수
      const createTexture = (data) => {
          const texture = new THREE.DataTexture(
              data,
              size,
              size,
              THREE.RGBAFormat
          );
          // 텍스처 품질 설정
          texture.magFilter = THREE.LinearFilter;          // 확대 시 보간
          texture.minFilter = THREE.LinearMipmapLinearFilter; // 축소 시 밉맵 사용
          texture.generateMipmaps = true;                 // 밉맵 생성
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping; // 타일링 가능하도록 설정
          texture.repeat.set(2, 2);                       // 텍스처 반복 횟수
          texture.needsUpdate = true;                     // 텍스처 업데이트 플래그
          return texture;
      };

      // 4.4 최종 텍스처 생성
      this.healthyNoiseTexture = createTexture(healthyNoiseData);
      this.fibrosisNoiseTexture = createTexture(fibrosisNoiseData);
    }


    // 5. Three.js 초기화 메서드
    initialize() {
      // 5.1 컨테이너 요소 확인
      this.container = document.getElementById('container');
      if (!this.container) {
          throw new Error('Container element not found');
      }
      
      // 5.2 WebGL 렌더러 설정
      this.renderer = new THREE.WebGLRenderer({ 
          antialias: true,               // 계단 현상 방지
          alpha: true,                   // 투명도 지원
          logarithmicDepthBuffer: true,  // 깊이 버퍼 정밀도 향상
          precision: 'highp',            // 높은 정밀도
          powerPreference: "high-performance",
          stencil: false                 // 스텐실 버퍼 비활성화
      });
      
      // 5.3 렌더러 추가 설정
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.physicallyCorrectLights = true;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // 5.4 렌더러를 DOM에 추가
      this.container.appendChild(this.renderer.domElement);
      
      // 5.5 CSS2D 렌더러 설정 (라벨링용)
      this.labelRenderer = new CSS2DRenderer();
      this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
      this.labelRenderer.domElement.style.position = 'absolute';
      this.labelRenderer.domElement.style.top = '0px';
      this.labelRenderer.domElement.style.pointerEvents = 'none';
      this.container.appendChild(this.labelRenderer.domElement);

      // 5.6 카메라 설정
      this.camera = new THREE.PerspectiveCamera(
          75,                                         // FOV
          window.innerWidth / window.innerHeight,     // 화면 비율
          0.1,                                        // 근평면
          1000                                        // 원평면
      );
      this.camera.position.z = 5;

      // 5.7 씬 설정
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x222222);  // 어두운 배경색
    }

    // 6. 씬 생성 및 헬퍼 설정
    createScene() {
      // 6.1 궤도 컨트롤 설정
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;       // 부드러운 카메라 움직임
      this.controls.dampingFactor = 0.05;       // 감쇠 정도
      
      // 6.2 카메라 헬퍼 추가 (카메라 위치 시각화)
      this.cameraHelper = new THREE.CameraHelper(this.camera);
      this.cameraHelper.name = 'helper';        // 헬퍼 토글을 위한 이름 설정
      this.scene.add(this.cameraHelper);
      
      // 6.3 좌표축 헬퍼 추가 (X, Y, Z 축 시각화)
      const axesHelper = new THREE.AxesHelper(200);
      axesHelper.name = 'helper';
      this.scene.add(axesHelper);

      // 6.4 축 라벨 생성 함수 (좌표축 이름 표시)
      const createAxisLabel = (text, position, color) => {
          const div = document.createElement('div');
          div.className = 'axis-label';
          div.textContent = text;
          div.style.color = color;
          div.style.fontSize = '14px';
          div.style.fontWeight = 'bold';
          div.style.fontFamily = 'Arial';
          div.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
          div.style.padding = '2px 6px';
          div.style.borderRadius = '3px';
          div.style.userSelect = 'none';
          
          const label = new CSS2DObject(div);
          label.position.copy(position);
          label.name = 'helper';
          return label;
      };

      // 6.5 원점 및 좌표축 라벨 추가
      // 원점 라벨
      const originLabel = createAxisLabel('Origin', new THREE.Vector3(0, -20, 0), '#ffffff');
      this.scene.add(originLabel);

      // X, Y, Z 축 라벨
      const xLabel = createAxisLabel('X', new THREE.Vector3(220, 0, 0), '#ff4444');
      const yLabel = createAxisLabel('Y', new THREE.Vector3(0, 220, 0), '#44ff44');
      const zLabel = createAxisLabel('Z', new THREE.Vector3(0, 0, 220), '#4444ff');
      [xLabel, yLabel, zLabel].forEach(label => this.scene.add(label));

      // 6.6 원점 표시 구체
      const originSphere = new THREE.Mesh(
          new THREE.SphereGeometry(5, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      originSphere.name = 'helper';
      this.scene.add(originSphere);

      // 6.7 조명 설정 호출
      this.setupLights();
    }

    // 7. 조명 설정
    setupLights(center = new THREE.Vector3(), modelSize = 300) {
      // 7.1 기존 조명 제거
      this.scene.remove(...this.scene.children.filter(child => child.isLight));

      const lightDistance = modelSize * 1.5;  // 조명 거리 설정

      // 7.2 조명 강도 설정
      const ambientIntensity = this.isDarkMode ? 0.5 : 0.7;    // 환경광
      const mainIntensity = this.isDarkMode ? 0.7 : 0.5;       // 주 광원
      const fillIntensity = this.isDarkMode ? 0.4 : 0.3;       // 보조광
      const backIntensity = this.isDarkMode ? 0.3 : 0.2;       // 후면광

      // 7.3 환경광 설정 (전체적인 기본 조명)
      const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
      this.scene.add(ambientLight);

      // 7.4 방향성 조명 생성 함수
      const createSoftLight = (position, intensity, color = 0xffffff) => {
          const light = new THREE.DirectionalLight(color, intensity);
          light.position.copy(position);
          light.target.position.set(0, 0, 0);
          this.scene.add(light.target);
          return light;
      };

      // 7.5 주 광원 설정 (두 개의 메인 라이트로 분산)
      const mainLight1 = createSoftLight(
          new THREE.Vector3(lightDistance * 0.8, lightDistance * 0.6, lightDistance * 0.7),
          mainIntensity * 0.6
      );
      const mainLight2 = createSoftLight(
          new THREE.Vector3(lightDistance * 0.6, lightDistance * 0.7, lightDistance * 0.8),
          mainIntensity * 0.4
      );

      // 그림자 설정 (주 광원)
      mainLight1.castShadow = true;
      mainLight1.shadow.mapSize.width = 2048;
      mainLight1.shadow.mapSize.height = 2048;
      mainLight1.shadow.camera.near = 0.5;
      mainLight1.shadow.camera.far = lightDistance * 3;
      mainLight1.shadow.camera.left = -modelSize;
      mainLight1.shadow.camera.right = modelSize;
      mainLight1.shadow.camera.top = modelSize;
      mainLight1.shadow.camera.bottom = -modelSize;
      mainLight1.shadow.normalBias = 0.02;

      // 7.6 보조 광원 (필라이트) 설정
      const fillLight = createSoftLight(
        new THREE.Vector3(-lightDistance * 0.5, lightDistance * 0.3, lightDistance * 0.5),
        fillIntensity
    );

    // 7.7 후면 광원 설정 (두 개로 분산)
    const backLight1 = createSoftLight(
        new THREE.Vector3(-lightDistance * 0.2, lightDistance * 0.5, -lightDistance * 0.8),
        backIntensity * 0.6
    );
    const backLight2 = createSoftLight(
        new THREE.Vector3(lightDistance * 0.2, lightDistance * 0.4, -lightDistance * 0.8),
        backIntensity * 0.4
    );

    // 7.8 모든 광원의 타겟 설정
    [mainLight1, mainLight2, fillLight, backLight1, backLight2].forEach(light => {
        light.target.position.copy(center);
        this.scene.add(light.target);
    });

    // 7.9 조명 라벨 생성 함수
    const createLightLabel = (text, position, color = '#ffffff') => {
        const div = document.createElement('div');
        div.className = 'light-label';
        div.textContent = text;
        div.style.color = color;
        div.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        div.style.padding = '2px 6px';
        div.style.borderRadius = '3px';
        div.style.fontSize = '12px';
        div.style.fontFamily = 'Arial';
        div.style.userSelect = 'none';
        div.style.whiteSpace = 'nowrap';
        
        const label = new CSS2DObject(div);
        label.position.copy(position);
        label.name = 'helper';
        return label;
    };

    // 7.10 조명 라벨 생성 및 추가
    const labels = [
      createLightLabel('Main Light 1', mainLight1.position, '#FFD700'),
      createLightLabel('Main Light 2', mainLight2.position, '#FFD700'),
      createLightLabel('Fill Light', fillLight.position, '#87CEEB'),
      createLightLabel('Back Light 1', backLight1.position, '#98FB98'),
      createLightLabel('Back Light 2', backLight2.position, '#98FB98')  // 마지막 콤마 제거
    ];
    labels.forEach(label => this.scene.add(label));

    // 7.11 조명 헬퍼 추가 (디버깅용)
    if (this.isDarkMode) {
      const helpers = [
        new THREE.DirectionalLightHelper(mainLight1, modelSize * 0.1),
        new THREE.DirectionalLightHelper(mainLight2, modelSize * 0.1),
        new THREE.DirectionalLightHelper(fillLight, modelSize * 0.1),
        new THREE.DirectionalLightHelper(backLight1, modelSize * 0.1),
        new THREE.DirectionalLightHelper(backLight2, modelSize * 0.1)  // 마지막 콤마 제거
    ];
        
        helpers.forEach(helper => {
            helper.name = 'helper';
            this.scene.add(helper);
        });
    }

    // 모든 조명을 씬에 추가
    [mainLight1, mainLight2, fillLight, backLight1, backLight2].forEach(light => {
        this.scene.add(light);
    });
    }

    // 8. 재질 생성
    createMaterials() {
    // 8.1 환경 맵 생성
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envMap = pmremGenerator.fromScene(new THREE.Scene()).texture;

    // 8.2 간 재질 생성 함수
    const createLiverMaterial = (baseColor, subsurfaceColor, attenuationColor, noiseTexture) => {
        return new THREE.MeshPhysicalMaterial({
            // 기본 재질 속성
            color: baseColor,
            metalness: 0.0,           // 비금속
            roughness: 0.7,           // 표면 거칠기
            clearcoat: 0.2,           // 코팅 강도
            clearcoatRoughness: 0.5,  // 코팅 거칠기
            
            // 투명도 관련 설정
            transmission: 0.1,         // 빛 투과도
            thickness: 0.5,           // 재질 두께
            transparent: true,        
            opacity: 0.7,             // 전체 투명도
            
            // Subsurface(내부 산란) 설정
            ior: 1.35,                // 굴절률
            sheen: 0.3,               // 미세 표면 산란
            sheenRoughness: 0.6,
            sheenColor: subsurfaceColor,
            
            // 감쇠 설정
            attenuationDistance: 0.5,  // 빛 감쇠 거리
            attenuationColor: attenuationColor,
            
            // 노이즈 맵 설정
            displacementMap: noiseTexture,
            displacementScale: 0.01,
            displacementBias: -0.005,
            
            // 기타 설정
            side: THREE.DoubleSide,
            envMap: envMap,
            envMapIntensity: 0.2,
            depthWrite: true,
            depthTest: true
        });
    };

    // 8.3 건강한 간 색상 설정
    const healthyBaseColor = new THREE.Color(0xD16B52);      // 붉은 갈색
    const healthySubsurfaceColor = new THREE.Color(0xE87F6A).multiplyScalar(0.7);  // 밝은 살색
    const healthyAttenuationColor = new THREE.Color(0xFFB5A5).multiplyScalar(0.6); // 연한 살색

    // 8.4 간경화 색상 설정
    const fibrosisBaseColor = new THREE.Color(0xB87A5E);     // 어두운 갈색
    const fibrosisSubsurfaceColor = new THREE.Color(0xA85C3E).multiplyScalar(0.7); // 탁한 갈색
    const fibrosisAttenuationColor = new THREE.Color(0x8B4513).multiplyScalar(0.6); // 어두운 갈색

    // 8.5 간 재질 생성
    this.healthyMaterial = createLiverMaterial(
        healthyBaseColor,
        healthySubsurfaceColor,
        healthyAttenuationColor,
        this.healthyNoiseTexture
    );

    this.fibrosisMaterial = createLiverMaterial(
        fibrosisBaseColor,
        fibrosisSubsurfaceColor,
        fibrosisAttenuationColor,
        this.fibrosisNoiseTexture
    );

    // 8.6 간경화 재질 추가 설정
    Object.assign(this.fibrosisMaterial, {
        roughness: 0.8,              // 더 거친 표면
        sheenRoughness: 0.7,         // 더 거친 산란
        attenuationDistance: 0.4,    // 더 짧은 산란 거리
        clearcoatRoughness: 0.6,     // 더 거친 코팅
        transmission: 0.08,          // 더 낮은 투과도
        thickness: 0.6               // 약간 더 두껍게
    });

    // 8.7 혈관 재질 생성 함수
    const createVesselMaterial = (color) => {
        return new THREE.MeshPhysicalMaterial({
            color: color,
            metalness: 0.3,           // 약간의 금속성
            roughness: 0.4,           // 매끄러운 표면
            clearcoat: 0.8,           // 강한 코팅
            clearcoatRoughness: 0.2,  // 매끄러운 코팅
            transmission: 0.0,         // 투과도 없음
            thickness: 0.5,
            transparent: false,        // 투명도 없음
            opacity: 1.0,             // 완전 불투명
            side: THREE.DoubleSide,
            envMap: envMap,
            envMapIntensity: 0.4,
            depthWrite: true,
            depthTest: true
        });
    };

    // 8.8 각 혈관별 재질 생성
    this.haMaterial = createVesselMaterial(new THREE.Color(0xE71000));  // 동맥 - 붉은색
    this.pvMaterial = createVesselMaterial(new THREE.Color(0xC2A9E7));  // 문맥 - 보라색
    this.bdMaterial = createVesselMaterial(new THREE.Color(0x33ff33));  // 담도 - 초록색
    }

    // 9. 3D 모델 로드
    loadMesh() {
      const loader = new GLTFLoader();
      const loadingElem = document.getElementById('loading');
      
      // 9.1 메시 생성 헬퍼 함수
      const createMesh = (geometry, material, renderOrder) => {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.renderOrder = renderOrder;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          return mesh;
      };

      // 9.2 모델 로드
      loader.load(
          'https://imsso-bmed.github.io/LiverAIz_3D_webviewer/models/LDLT_D_fusion.glb',
          (gltf) => {
              const model = gltf.scene;

              // 9.3 모델의 바운딩 박스 계산
              const boundingBox = new THREE.Box3().setFromObject(model);
              const center = new THREE.Vector3();
              boundingBox.getCenter(center);
              
              // 9.4 모델을 원점으로 이동
              model.position.sub(center);

              // 9.5 모델의 메시 처리
              model.traverse((child) => {
                  if (child.isMesh) {
                      const geometry = child.geometry;
                      geometry.computeVertexNormals();
                      geometry.attributes.normal.normalized = true;
                      
                      const meshName = child.name.toLowerCase();
                      let mesh;

                      // 메시 타입별 재질 적용 및 렌더링 순서 설정
                      if (meshName.includes('ha') || meshName.includes('artery')) {
                          mesh = createMesh(geometry, this.haMaterial, 1);
                      } else if (meshName.includes('pv') || meshName.includes('portal')) {
                          mesh = createMesh(geometry, this.pvMaterial, 2);
                      } else if (meshName.includes('bd') || meshName.includes('bile')) {
                          mesh = createMesh(geometry, this.bdMaterial, 3);
                      } else if (meshName.includes('liver')) {
                          this.liver = createMesh(geometry, this.healthyMaterial, 4);
                          mesh = this.liver;
                      }

                      if (mesh) {
                          // 메시의 위치를 모델의 이동에 맞춰 조정
                          mesh.position.sub(center);
                          this.scene.add(mesh);
                      }
                  }
              });

              // 9.6 모델 크기 계산
              const size = new THREE.Vector3();
              boundingBox.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z);

              // 9.7 조명 재설정 - 원점 기준
              this.setupLights(new THREE.Vector3(0, 0, 0), maxDim);

              // 9.8 카메라 위치 조정
              const fov = this.camera.fov * (Math.PI / 180);
              let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.2;

              // 카메라를 원점 기준으로 설정
              this.camera.position.set(0, 0, cameraZ);
              this.camera.lookAt(0, 0, 0);
              this.camera.near = cameraZ / 100;
              this.camera.far = cameraZ * 100;
              this.camera.updateProjectionMatrix();

              // 9.9 OrbitControls 타겟을 원점으로 설정
              this.controls.target.set(0, 0, 0);
              this.controls.update();

              // 9.10 로딩 표시 제거
              if (loadingElem) {
                  loadingElem.style.display = 'none';
              }
          },
          // 9.11 로딩 진행률 표시
          (xhr) => {
              if (loadingElem) {
                  const percent = xhr.loaded / xhr.total * 100;
                  loadingElem.textContent = `Loading: ${Math.round(percent)}%`;
              }
          },
          // 9.12 에러 처리
          (error) => {
              console.error('Error loading model:', error);
              if (loadingElem) {
                  loadingElem.textContent = 'Error loading model';
              }
          }
      );
    }

    // 10. 컨트롤 설정
    setupControls() {
      // 10.1 컨트롤 컨테이너 생성 및 스타일 설정
      this.controlsContainer = document.createElement('div');
      Object.assign(this.controlsContainer.style, {
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: '100',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
      });

      // 10.2 버튼 생성 유틸리티 함수
      const createButton = (text, onClick) => {
          const button = document.createElement('button');
          button.textContent = text;
          button.style.padding = '10px';
          button.addEventListener('click', onClick);
          return button;
      };

      // 10.3 재질 토글 버튼 생성
      const toggleMaterialButton = createButton('Toggle Liver Material', () => {
          if (!this.liver) return;
          this.liver.material = 
              this.liver.material === this.healthyMaterial ? 
              this.fibrosisMaterial : 
              this.healthyMaterial;
      });

      // 10.4 다크모드 토글 버튼 생성
      const toggleModeButton = createButton(
          this.isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
          () => {
              this.isDarkMode = !this.isDarkMode;
              this.scene.background = new THREE.Color(
                  this.isDarkMode ? 0x222222 : 0xF5F5F5
              );
              this.setupLights();
              toggleModeButton.textContent = this.isDarkMode ? 
                  'Switch to Light Mode' : 
                  'Switch to Dark Mode';
          }
      );

      // 10.5 헬퍼 토글 버튼 생성
      const toggleHelpersButton = createButton('Toggle Helpers', () => {
          this.scene.traverse((child) => {
              if (child.name === 'helper' || 
                  child instanceof THREE.AxesHelper || 
                  child instanceof THREE.GridHelper ||
                  child instanceof CSS2DObject ||
                  child.type === 'Line') {
                  child.visible = !child.visible;
              }
          });
      });

      // 10.6 버튼들을 컨테이너에 추가
      this.controlsContainer.appendChild(toggleMaterialButton);
      this.controlsContainer.appendChild(toggleModeButton);
      this.controlsContainer.appendChild(toggleHelpersButton);

      // 10.7 컨테이너를 문서에 추가
      document.body.appendChild(this.controlsContainer);

      // 10.8 윈도우 리사이즈 이벤트 리스너 등록
      window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    // 11. 애니메이션 및 렌더링
    animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();  // 컨트롤 업데이트

    // 카메라 헬퍼 업데이트
    if (this.cameraHelper) {
        this.cameraHelper.update();
    }

    // 씬 렌더링
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    }

    // 12. 윈도우 리사이즈 처리
    onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    // 렌더러 크기 업데이트
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    }


}

// 앱 시작
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new LiverViewer());
} else {
  new LiverViewer();
}

