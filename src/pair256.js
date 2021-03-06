/*
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

var PAIR256 = function(ctx) {
    "use strict";

    /**
      * Creates an instance of PAIR256
      *
      * @constructor
      * @this {PAIR256}
      */                
    var PAIR256 = {
	
	/**
         * Line function 
         *
         * @this {PAIR256}
         */	
        line: function(A, B, Qx, Qy) {
            var r = new ctx.FP48(1),
                XX, YY, ZZ, YZ, sb,
                X1, Y1, T1, T2,
                a, b, c;

            if (A == B) { /* Doubling */
                XX = new ctx.FP8(A.getx());
                YY = new ctx.FP8(A.gety());
                ZZ = new ctx.FP8(A.getz());
                YZ = new ctx.FP8(YY);

                YZ.mul(ZZ); //YZ
                XX.sqr(); //X^2
                YY.sqr(); //Y^2
                ZZ.sqr(); //Z^2

                YZ.imul(4);
                YZ.neg();
                YZ.norm(); //-2YZ
                YZ.tmul(Qy); //-2YZ.Ys

                XX.imul(6); //3X^2
                XX.tmul(Qx); //3X^2.Xs

                sb = 3 * ctx.ROM_CURVE.CURVE_B_I;
                ZZ.imul(sb);
                if (ctx.ECP.SEXTIC_TWIST == ctx.ECP.D_TYPE) {
                    ZZ.div_2i();
                }
                if (ctx.ECP.SEXTIC_TWIST == ctx.ECP.M_TYPE) {
                    ZZ.times_i();
                    ZZ.add(ZZ);
                    YZ.times_i();
                    YZ.norm();
                }
                ZZ.norm(); // 3b.Z^2

                YY.add(YY);
                ZZ.sub(YY);
                ZZ.norm(); // 3b.Z^2-Y^2

                a = new ctx.FP16(YZ, ZZ); // -2YZ.Ys | 3b.Z^2-Y^2 | 3X^2.Xs
                if (ctx.ECP.SEXTIC_TWIST == ctx.ECP.D_TYPE) {
                    b = new ctx.FP16(XX); // L(0,1) | L(0,0) | L(1,0)
                    c = new ctx.FP16(0);
                }
                if (ctx.ECP.SEXTIC_TWIST == ctx.ECP.M_TYPE) {
                    b = new ctx.FP16(0);
                    c = new ctx.FP16(XX); c.times_i();
                }

                A.dbl();
            } else { /* Addition */
                X1 = new ctx.FP8(A.getx()); // X1
                Y1 = new ctx.FP8(A.gety()); // Y1
                T1 = new ctx.FP8(A.getz()); // Z1
                T2 = new ctx.FP8(A.getz()); // Z1

                T1.mul(B.gety()); // T1=Z1.Y2
                T2.mul(B.getx()); // T2=Z1.X2

                X1.sub(T2);
                X1.norm(); // X1=X1-Z1.X2
                Y1.sub(T1);
                Y1.norm(); // Y1=Y1-Z1.Y2

                T1.copy(X1); // T1=X1-Z1.X2
                X1.tmul(Qy); // X1=(X1-Z1.X2).Ys

                if (ctx.ECP.SEXTIC_TWIST == ctx.ECP.M_TYPE) {
                    X1.times_i();
                    X1.norm();
                }

                T1.mul(B.gety()); // T1=(X1-Z1.X2).Y2

                T2.copy(Y1); // T2=Y1-Z1.Y2
                T2.mul(B.getx()); // T2=(Y1-Z1.Y2).X2
                T2.sub(T1);
                T2.norm(); // T2=(Y1-Z1.Y2).X2 - (X1-Z1.X2).Y2
                Y1.tmul(Qx);
                Y1.neg();
                Y1.norm(); // Y1=-(Y1-Z1.Y2).Xs

                a = new ctx.FP16(X1, T2); // (X1-Z1.X2).Ys  |  (Y1-Z1.Y2).X2 - (X1-Z1.X2).Y2  | - (Y1-Z1.Y2).Xs
                if (ctx.ECP.SEXTIC_TWIST == ctx.ECP.D_TYPE) {
                    b = new ctx.FP16(Y1);
                    c = new ctx.FP16(0);
                }
                if (ctx.ECP.SEXTIC_TWIST == ctx.ECP.M_TYPE) {
                    b = new ctx.FP16(0);
                    c = new ctx.FP16(Y1); c.times_i();
                }

                A.add(B);
            }

            r.set(a, b, c);
			r.settype(ctx.FP.SPARSER);
            return r;
        },

	/**
         * prepare for multi-pairing 
         *
         * @this {PAIR256}
         */	
	initmp: function() {
			var r=[];
			for (var i=0;i<ctx.ECP.ATE_BITS;i++)
				r[i] = new ctx.FP48(1);
			return r;
		},

	/**
         * basic Miller loop
         *
         * @this {PAIR256}
	 * @param r FP48 precomputed array of accumulated line functions
 	 * @param res FP48 result
         */	
	miller: function(r) {
			var res=new ctx.FP48(1);
			for (var i=ctx.ECP.ATE_BITS-1; i>=1; i--)
			{
				res.sqr();
				res.ssmul(r[i]); 
			}

			if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX)
				res.conj();
			res.ssmul(r[0]);

			return res;
		},

	/**
         * Precompute line functions for n-pairing
         *
         * @this {PAIR256}
         * @param r array of precomputed FP48 products of line functions
	 * @param P1 An element of G2
	 * @param Q1 An element of G1
         */
	another: function(r,P1,Q1) {
			var f;
			var n=new ctx.BIG(0);
			var n3=new ctx.BIG(0);
			var lv,lv2;
			var bt;

			// P is needed in affine form for line function, Q for (Qx,Qy) extraction
			var P=new ctx.ECP8(); P.copy(P1); P.affine();
			var Q=new ctx.ECP(); Q.copy(Q1); Q.affine();

			P.affine();
			Q.affine();

			var Qx=new ctx.FP(Q.getx());
			var Qy=new ctx.FP(Q.gety());

			var A=new ctx.ECP8();
			A.copy(P);

			var MP=new ctx.ECP8();
			MP.copy(P); MP.neg();

			var nb=PAIR256.lbits(n3,n);

			for (var i=nb-2;i>=1;i--)
			{
				lv=PAIR256.line(A,A,Qx,Qy);

				bt=n3.bit(i)-n.bit(i); 
				if (bt==1)
				{
					lv2=PAIR256.line(A,P,Qx,Qy);
					lv.smul(lv2);
				}
				if (bt==-1)
				{
					lv2=PAIR256.line(A,MP,Qx,Qy);
					lv.smul(lv2);
				}
				r[i].ssmul(lv);
			} 
		},


	/**
         * Calculate Miller loop for Optimal ATE pairing e(P,Q)
         *
         * @this {PAIR256}
	 * @param P1 An element of G2
	 * @param Q1 An element of G1
	 * @result r An element of GT i.e. result of the pairing calculation e(P,Q)
         */
        ate: function(P1, Q1) {
            var x, n, n3, lv, lv2,
                Qx, Qy, A, NP, r, nb, bt,
                i;

            n = new ctx.BIG(0);
			n3 = new ctx.BIG(0);

			var P=new ctx.ECP8(); P.copy(P1); P.affine();
			var Q=new ctx.ECP(); Q.copy(Q1); Q.affine();

            Qx = new ctx.FP(Q.getx()); 
            Qy = new ctx.FP(Q.gety()); 

            A = new ctx.ECP8();
            r = new ctx.FP48(1);

            A.copy(P);
			NP = new ctx.ECP8();
			NP.copy(P);
			NP.neg();


            nb = PAIR256.lbits(n3,n);

            for (i = nb - 2; i >= 1; i--) {
                r.sqr();
                lv = PAIR256.line(A, A, Qx, Qy);
                bt=n3.bit(i)-n.bit(i);

                if (bt == 1) {
                    lv2 = PAIR256.line(A, P, Qx, Qy);
                    lv.smul(lv2);
                }
                if (bt == -1) {
                    lv2 = PAIR256.line(A, NP, Qx, Qy);
                    lv.smul(lv2);
                }
                r.ssmul(lv);
            }

            if (ctx.ECP.SIGN_OF_X == ctx.ECP.NEGATIVEX) {
                r.conj();
            }

            return r;
        },

	/**
         * Calculate Miller loop for Optimal ATE double-pairing e(P,Q).e(R,S)
         *
         * @this {PAIR256}
	 * @param P1 An element of G2
	 * @param Q1 An element of G1
	 * @param R1 An element of G2
	 * @param S1 An element of G1
	 * @result r An element of GT i.e. result of the double pairing calculation e(P,Q).e(R,S)
         */
        ate2: function(P1, Q1, R1, S1) {
            var x, n, n3, lv, lv2,
                Qx, Qy, Sx, Sy, A, B, NP, NR, r, nb, bt,
                i;

            n = new ctx.BIG(0);
			n3 = new ctx.BIG(0);

			var P=new ctx.ECP8(); P.copy(P1); P.affine();
			var Q=new ctx.ECP(); Q.copy(Q1); Q.affine();
			var R=new ctx.ECP8(); R.copy(R1); R.affine();
			var S=new ctx.ECP(); S.copy(S1); S.affine();


            Qx = new ctx.FP(Q.getx()); 
            Qy = new ctx.FP(Q.gety()); 

            Sx = new ctx.FP(S.getx()); 
            Sy = new ctx.FP(S.gety()); 

            A = new ctx.ECP8();
            B = new ctx.ECP8();
            r = new ctx.FP48(1);

            A.copy(P);
            B.copy(R);
			NP = new ctx.ECP8();
			NP.copy(P);
			NP.neg();
			NR = new ctx.ECP8();
			NR.copy(R);
			NR.neg();


            nb = PAIR256.lbits(n3,n);

            for (i = nb - 2; i >= 1; i--) {
                r.sqr();
                lv = PAIR256.line(A, A, Qx, Qy);
                lv2 = PAIR256.line(B, B, Sx, Sy);
				lv.smul(lv2);
                r.ssmul(lv);

                bt=n3.bit(i)-n.bit(i);

                if (bt == 1) {
                    lv = PAIR256.line(A, P, Qx, Qy);
                    lv2 = PAIR256.line(B, R, Sx, Sy);
					lv.smul(lv2);
                    r.ssmul(lv);
                }
                if (bt == -1) {
                    lv = PAIR256.line(A, NP, Qx, Qy);
                    lv2 = PAIR256.line(B, NR, Sx, Sy);
					lv.smul(lv2);
                    r.ssmul(lv);
                }
            }

            if (ctx.ECP.SIGN_OF_X == ctx.ECP.NEGATIVEX) {
                r.conj();
            }

            return r;
        },

	/**
         * Final exponentiation of pairing, converts output of Miller loop to element in GT
         *
         * @this {PAIR256}
	 * @param m FP48 value
	 * @result r m^((p^12-1)/r) where p is modulus and r is the group order
         */
        fexp: function(m) {
            var fa, fb, f, x, r, lv,
                t1,t2,t3,t7;

            fa = new ctx.BIG(0);
            fa.rcopy(ctx.ROM_FIELD.Fra);
            fb = new ctx.BIG(0);
            fb.rcopy(ctx.ROM_FIELD.Frb);
            f = new ctx.FP2(fa, fb);
            x = new ctx.BIG(0);
            x.rcopy(ctx.ROM_CURVE.CURVE_Bnx);

            r = new ctx.FP48(m); //r.copy(m);

            /* Easy part of final exp */
            lv = new ctx.FP48(r); //lv.copy(r);
            lv.inverse();
            r.conj();
            r.mul(lv);
            lv.copy(r);
            r.frob(f,8);
            r.mul(lv);
//			if (r.isunity())
//			{
//				r.zero();
//				return r;
//			}
            /* Hard part of final exp */
            // Ghamman & Fouotsa Method
            t7=new ctx.FP48(r); t7.usqr();
            t1=t7.pow(x);

            x.fshr(1);
            t2=t1.pow(x);
            x.fshl(1);

            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3=new ctx.FP48(t1); t3.conj();
            t2.mul(t3);
            t2.mul(r);

            r.mul(t7);

            t1=t2.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }
            t3.copy(t1);
            t3.frob(f,14);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,13);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,12);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,11);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,10);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,9);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,8);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t2); t3.conj();
            t1.mul(t3);
            t3.copy(t1);
            t3.frob(f,7);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,6);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,5);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,4);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,3);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,2);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            t3.copy(t1);
            t3.frob(f,1);
            r.mul(t3);
            t1=t1.pow(x);
            if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
                t1.conj();
            }

            r.mul(t1);
            t2.frob(f,15);
            r.mul(t2);

            r.reduce();
            return r;
        }
    };

    /**
      * prepare ate parameter, n=6u+2 (BN) or n=u (BLS), n3=3*n 
      *
      * @this {PAIR256}
      */
    PAIR256.lbits = function(n3,n) {
		n.rcopy(ctx.ROM_CURVE.CURVE_Bnx);
		n3.copy(n);
		n3.pmul(3);
		n3.norm();
		return n3.nbits();
	};

    /**
      * GLV method
      *
      * @this {PAIR256}
      */
    PAIR256.glv = function(e) {
        var u = [],
            q, x, x2;

        // -(x^2).P = (Beta.x,y)
        q = new ctx.BIG(0);
        q.rcopy(ctx.ROM_CURVE.CURVE_Order);
        x = new ctx.BIG(0);
        x.rcopy(ctx.ROM_CURVE.CURVE_Bnx);
        x2 = ctx.BIG.smul(x, x);
        x = ctx.BIG.smul(x2,x2);
        x2 = ctx.BIG.smul(x,x);
        u[0] = new ctx.BIG(e);
        u[0].mod(x2);
        u[1] = new ctx.BIG(e);
        u[1].div(x2);
        u[1].rsub(q);

        return u;
    };

    /**
      * Galbraith & Scott Method
      *
      * @this {PAIR256}
      */
    PAIR256.gs = function(e) {
        var u = [],
            i, q, x, w;

        x = new ctx.BIG(0);
        x.rcopy(ctx.ROM_CURVE.CURVE_Bnx);
        q = new ctx.BIG(0);
        q.rcopy(ctx.ROM_CURVE.CURVE_Order);
        w = new ctx.BIG(e);

        for (i = 0; i < 15; i++) {
            u[i] = new ctx.BIG(w);
            u[i].mod(x);
            w.div(x);
        }

        u[15] = new ctx.BIG(w);
        if (ctx.ECP.SIGN_OF_X==ctx.ECP.NEGATIVEX) {
            u[1].copy(ctx.BIG.modneg(u[1], q));
            u[3].copy(ctx.BIG.modneg(u[3], q));
            u[5].copy(ctx.BIG.modneg(u[5], q));
            u[7].copy(ctx.BIG.modneg(u[7], q));
            u[9].copy(ctx.BIG.modneg(u[9],q));
            u[11].copy(ctx.BIG.modneg(u[11],q));
            u[13].copy(ctx.BIG.modneg(u[13],q));
            u[15].copy(ctx.BIG.modneg(u[15],q));

        }

        return u;
    };

    /**
      * Fast point multiplication of a member of the group G1 by a BIG number
      *
      * @this {PAIR256}
      * @param P Member of G1
      * @param e BIG multiplier
      * @return R Member of G1 R=e.P
      */
    PAIR256.G1mul = function(P, e) {
        var R, Q, q, bcru, cru, t, u, np, nn;

        if (ctx.ROM_CURVE.USE_GLV) {
            R = new ctx.ECP();
            R.copy(P);
            Q = new ctx.ECP();
            Q.copy(P); Q.affine();
            q = new ctx.BIG(0);
            q.rcopy(ctx.ROM_CURVE.CURVE_Order);
            bcru = new ctx.BIG(0);
            bcru.rcopy(ctx.ROM_CURVE.CURVE_Cru);
            cru = new ctx.FP(bcru);
            t = new ctx.BIG(0);
            u = PAIR256.glv(e);

            Q.getx().mul(cru);

            np = u[0].nbits();
            t.copy(ctx.BIG.modneg(u[0], q));
            nn = t.nbits();
            if (nn < np) {
                u[0].copy(t);
                R.neg();
            }

            np = u[1].nbits();
            t.copy(ctx.BIG.modneg(u[1], q));
            nn = t.nbits();
            if (nn < np) {
                u[1].copy(t);
                Q.neg();
            }
            u[0].norm();
            u[1].norm();
            R = R.mul2(u[0], Q, u[1]);
        } else {
            R = P.mul(e);
        }

        return R;
    };

    /**
      * Multiply P by e in group G2
      *
      * @this {PAIR256}
      * @param P Member of G2
      * @param e BIG multiplier
      * @return R Member of G2 R=e.P
      */
    PAIR256.G2mul = function(P, e) {
        var R, Q, F, q, u, t, i, np, nn;

        if (ctx.ROM_CURVE.USE_GS_G2) {
            Q = [];
            F = ctx.ECP8.frob_constants();

            q = new ctx.BIG(0);
            q.rcopy(ctx.ROM_CURVE.CURVE_Order);

            u = PAIR256.gs(e);
            t = new ctx.BIG(0);
          
            Q[0] = new ctx.ECP8();
            Q[0].copy(P);

            for (i = 1; i < 16; i++) {
                Q[i] = new ctx.ECP8();
                Q[i].copy(Q[i - 1]);
                Q[i].frob(F,1);
            }

            for (i = 0; i < 16; i++) {
                np = u[i].nbits();
                t.copy(ctx.BIG.modneg(u[i], q));
                nn = t.nbits();

                if (nn < np) {
                    u[i].copy(t);
                    Q[i].neg();
                }
                u[i].norm();
            }

            R = ctx.ECP8.mul16(Q, u);
        } else {
            R = P.mul(e);
        }
        return R;
    };

    /**
      * Fast raising of a member of GT to a BIG power
      *
      * @this {PAIR256}
      * @param d Member of GT
      * @param e BIG exponent
      * @return r d^e
      */    
    PAIR256.GTpow = function(d, e) {
        var r, g, fa, fb, f, q, t, u, i, np, nn;

        if (ctx.ROM_CURVE.USE_GS_GT) {
            g = [];
            fa = new ctx.BIG(0);
            fa.rcopy(ctx.ROM_FIELD.Fra);
            fb = new ctx.BIG(0);
            fb.rcopy(ctx.ROM_FIELD.Frb);
            f = new ctx.FP2(fa, fb);
            q = new ctx.BIG(0);
            q.rcopy(ctx.ROM_CURVE.CURVE_Order);
            t = new ctx.BIG(0);
            u = PAIR256.gs(e);

            g[0] = new ctx.FP48(d);

            for (i = 1; i < 16; i++) {
                g[i] = new ctx.FP48(0);
                g[i].copy(g[i - 1]);
                g[i].frob(f,1);
            }

            for (i = 0; i < 16; i++) {
                np = u[i].nbits();
                t.copy(ctx.BIG.modneg(u[i], q));
                nn = t.nbits();

                if (nn < np) {
                    u[i].copy(t);
                    g[i].conj();
                }
                u[i].norm();
            }

            r = ctx.FP48.pow16(g, u);
        } else {
            r = d.pow(e);
        }

        return r;
    };

    return PAIR256;
};

// CommonJS module exports
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
  module.exports.PAIR256 = PAIR256;
}
