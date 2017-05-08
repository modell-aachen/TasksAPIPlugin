<script>
import MaketextMixin from './MaketextMixin.vue';
export default {
    mixins: [MaketextMixin],
    data(){
        return{
            showValidationWarnings: false
        };
    },
    props: ['fieldName', 'fields', 'autoAssigns', 'initialFocus'],
    computed: {
        //Standard behaviour to check validity
        isValid() {
            return !(this.fields[this.fieldName].mandatory && !this.fields[this.fieldName].value);
        },
        id() {
            let guid = function b(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,b)};
            return guid();
        },
        isAutoAssigned(){
            if(this.autoAssigns)
                return (this.autoAssigns[this.fieldName] !== undefined);
            else
                return false;
        }
    },
    watch: {
        //A watcher to propagate validity information to the state.
        //This can then be read by the parent component.
        isValid(){
            this.showValidationWarnings = !this.isValid;
            this.fields[this.fieldName].isValid = this.isValid;
        },
        //This is set from outside to indicate to all fields to show
        //their warnings.
        "fields.showValidationWarnings": function(){
            this.showValidationWarnings = true;
        },
        isAutoAssigned(){
            if(this.isAutoAssigned){
                this.fields[this.fieldName].value = this.autoAssigns[this.fieldName];
            }
            else{
                this.fields[this.fieldName].value = "";
            }
        }
    },
    methods: {
        focus() {
            //Implement me in components which use this mixin.
        }
    },
    created(){
        //Unfortunately we have to set validity state manually after init as
        //the watcher above does not trigger when the computed property
        //is initially set.
        this.fields[this.fieldName].isValid = this.isValid;
    },
    mounted(){
        if(this.initialFocus){
            this.focus();
        }
    }
};
</script>
